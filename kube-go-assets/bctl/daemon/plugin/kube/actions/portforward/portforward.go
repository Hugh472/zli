package portforward

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	portforward "bastionzero.com/bctl/v1/bctl/agent/plugin/kube/actions/portforward"
	kubeutils "bastionzero.com/bctl/v1/bctl/daemon/plugin/kube/utils"
	lggr "bastionzero.com/bctl/v1/bzerolib/logger"
	plgn "bastionzero.com/bctl/v1/bzerolib/plugin"
	smsg "bastionzero.com/bctl/v1/bzerolib/stream/message"

	"golang.org/x/build/kubernetes/api"
	"k8s.io/apimachinery/pkg/util/httpstream"
	spdystream "k8s.io/apimachinery/pkg/util/httpstream/spdy"
)

type RequsetMapStruct struct {
	streamMessageContent portforward.KubePortForwardStreamMessageContent
	streamMessage        smsg.StreamMessage
}
type PortForwardAction struct {
	requestId             string
	logId                 string
	commandBeingRun       string
	ksResponseChannel     chan plgn.ActionWrapper
	RequestChannel        chan plgn.ActionWrapper
	streamChannel         chan smsg.StreamMessage
	logger                *lggr.Logger
	ctx                   context.Context
	streamPairsLock       sync.RWMutex
	streamPairs           map[string]*httpStreamPair
	streamCreationTimeout time.Duration
	endpoint              string

	// Map of portforardId <-> PortForwardSubAction
	requestMap     map[string]chan RequsetMapStruct
	requestMapLock sync.Mutex
}

// httpStreamPair represents the error and data streams for a port
// forwarding request.
type httpStreamPair struct {
	lock        sync.RWMutex
	requestID   string
	dataStream  httpstream.Stream
	errorStream httpstream.Stream
	complete    chan struct{}
}

func NewPortForwardAction(ctx context.Context,
	logger *lggr.Logger,
	requestId string,
	logId string,
	ch chan plgn.ActionWrapper,
	streamResponseChannel chan smsg.StreamMessage,
	commandBeingRun string) (*PortForwardAction, error) {

	return &PortForwardAction{
		requestId:             requestId,
		logId:                 logId,
		commandBeingRun:       commandBeingRun,
		RequestChannel:        ch,
		ksResponseChannel:     make(chan plgn.ActionWrapper),
		streamChannel:         make(chan smsg.StreamMessage, 100),
		logger:                logger,
		ctx:                   ctx,
		streamPairs:           make(map[string]*httpStreamPair),
		streamCreationTimeout: kubeutils.DefaultStreamCreationTimeout,
		requestMap:            make(map[string]chan RequsetMapStruct),
	}, nil
}

func (p *PortForwardAction) InputMessageHandler(writer http.ResponseWriter, request *http.Request) error {
	// Set our endpoint
	p.endpoint = request.URL.String()

	// Let Bastion know we want to start a port forward session
	// create error and data stream headers
	errorHeaders := map[string]string{}
	errorHeaders[kubeutils.StreamType] = kubeutils.StreamTypeError

	dataHeaders := map[string]string{}
	dataHeaders[kubeutils.StreamType] = kubeutils.StreamTypeData

	// Let Bastion know we want this stream
	payload := portforward.KubePortForwardStartActionPayload{
		RequestId:       p.requestId,
		LogId:           p.logId,
		ErrorHeaders:    errorHeaders,
		DataHeaders:     dataHeaders,
		Endpoint:        p.endpoint,
		CommandBeingRun: p.commandBeingRun,
	}
	payloadBytes, _ := json.Marshal(payload)
	p.RequestChannel <- plgn.ActionWrapper{
		Action:        string(portforward.StartPortForward),
		ActionPayload: payloadBytes,
	}

	// Now wait for the ready message, incase we need to bubble up an error to the user
readyMessageLoop:
	for {
		select {
		case streamMessage := <-p.streamChannel:
			if streamMessage.Type == string(portforward.ReadyPortForward) {
				// See if we have an error to bubble up to the user
				if len(streamMessage.Content) != 0 {
					// Bubble up the error to the user
					// Ref: https://pkg.go.dev/golang.org/x/build/kubernetes/api#Status
					toReturn := api.Status{
						Message: streamMessage.Content,
						Status:  api.StatusFailure,
						Code:    http.StatusForbidden,
						Reason:  "Forbidden",
					}
					toReturnMarshal, err := json.Marshal(toReturn)
					if err != nil {
						// Best effort bubble up
						writer.WriteHeader(http.StatusInternalServerError)
						writer.Write([]byte(err.Error()))
					} else {
						writer.WriteHeader(http.StatusForbidden)
						writer.Header().Set("Content-Type", "application/json")
						writer.Write(toReturnMarshal)
					}

					// Send close message
					p.SendCloseMessage()

					return fmt.Errorf("error starting portforward stream: %s", streamMessage.Content)
				}
				break readyMessageLoop
			}
		}
	}

	// Perform our http handshake
	_, err := httpstream.Handshake(request, writer, []string{kubeutils.PortForwardProtocolV1Name})
	if err != nil {
		return fmt.Errorf("could not perform http handshake: %v", err.Error())
	}

	// Now create our streamChan (where kubectl requests will come in)
	streamChan := make(chan httpstream.Stream, 1)

	// Upgrade the response
	upgrader := spdystream.NewResponseUpgraderWithPings(kubeutils.DefaultStreamCreationTimeout)
	conn := upgrader.UpgradeResponse(writer, request, p.httpStreamReceived(p.ctx, streamChan))
	if conn == nil {
		return fmt.Errorf("unable to upgrade websocket connection")
	}
	conn.SetIdleTimeout(kubeutils.DefaultIdleTimeout)
	defer conn.Close()

	// Now listen for incoming kubectl portforward requests in the background
	go func() {
		for {
			select {
			case <-conn.CloseChan():
				return
			case stream := <-streamChan:
				// Extract the requestId and streamType from the stream
				requestID, err := p.requestID(stream)
				if err != nil {
					p.logger.Error(fmt.Errorf("failed to parse request id: %v", err))
					return
				}
				streamType := stream.Headers().Get(kubeutils.StreamType)
				p.logger.Info(fmt.Sprintf("Received new stream %v of type %v.", requestID, streamType))

				// Now attempt to make our stream pair (error, data)
				portforwardSession, created := p.getStreamPair(requestID)

				// If this was a new stream pair that was created, start a go routine to ensure it finishes (i.e. gets the error/data strema)
				if created {
					go p.monitorStreamPair(portforwardSession, time.After(p.streamCreationTimeout))
				}

				// Attempt to add the stream, so we can join the two streams
				if complete, err := portforwardSession.add(stream); err != nil {
					msg := fmt.Sprintf("error processing stream for request %s: %v", requestID, err)
					portforwardSession.printError(msg)
				} else if complete {
					go p.portForward(portforwardSession)
				}
			}
		}
	}()

	// Keep this context till the user exits the http session
	// Keep the connection alive till we get a closeChan messsage, then close the context as well
	select {
	case <-conn.CloseChan():
		p.logger.Info("Portforwarding context finished. Sending close message to portforward action")
		p.SendCloseMessage()
		return nil
	}
}

// portForward invokes the portForwardProxy's forwarder.PortForward
// function for the given stream pair.
func (p *PortForwardAction) portForward(portforwardSession *httpStreamPair) {
	defer portforwardSession.dataStream.Close()
	defer portforwardSession.errorStream.Close()

	portString := portforwardSession.dataStream.Headers().Get(kubeutils.PortHeader)
	port, _ := strconv.ParseInt(portString, 10, 32)

	p.logger.Info(fmt.Sprintf("Forwarding to port %v. Request: %v.", portString, portforwardSession.requestID))
	err := p.forwardStreamPair(portforwardSession, port)
	p.SendCloseRequestMessage(portforwardSession.requestID)
	p.logger.Info(fmt.Sprintf("Completed forwarding port %v. Request: %v.", portString, portforwardSession.requestID))

	if err != nil {
		msg := fmt.Errorf("error forwarding port %d to pod ?: %v", port, err)
		p.logger.Error(msg)
	}
}

func (p *PortForwardAction) SendCloseRequestMessage(portforwardingRequestId string) {
	// Now send this data to Bastion
	payload := portforward.KubePortForwardStopRequestActionPayload{
		RequestId:            p.requestId,
		LogId:                p.logId,
		PortForwardRequestId: portforwardingRequestId,
	}
	payloadBytes, _ := json.Marshal(payload)
	p.RequestChannel <- plgn.ActionWrapper{
		Action:        string(portforward.StopPortForwardRequest),
		ActionPayload: payloadBytes,
	}
}

func (p *PortForwardAction) SendCloseMessage() {
	// Now send this data to Bastion
	payload := portforward.KubePortForwardStopActionPayload{
		RequestId: p.requestId,
		LogId:     p.logId,
	}
	payloadBytes, _ := json.Marshal(payload)
	p.RequestChannel <- plgn.ActionWrapper{
		Action:        string(portforward.StopPortForward),
		ActionPayload: payloadBytes,
	}
}

func (p *PortForwardAction) forwardStreamPair(portforwardSession *httpStreamPair, remotePort int64) error {
	// Make a done channel
	doneChan := make(chan bool)

	// Make and update the stream channel for this requestId
	p.updateRequestMap(make(chan RequsetMapStruct), portforwardSession.requestID)

	// Set up the go routine to push error data to Bastion
	go func() {
		defer portforwardSession.errorStream.Close()
		for {
			select {
			case <-doneChan:
				return
			default:
				buf := make([]byte, portforward.ErrorStreamBufferSize)
				n, err := portforwardSession.errorStream.Read(buf)
				if err == io.EOF {
					// Do not close the stream if we close the errorstream
					return
				}

				// Now send this data to Bastion
				payload := portforward.KubePortForwardActionPayload{
					RequestId:            p.requestId,
					LogId:                p.logId,
					Data:                 buf[:n],
					PortForwardRequestId: portforwardSession.requestID,
				}
				payloadBytes, _ := json.Marshal(payload)
				p.RequestChannel <- plgn.ActionWrapper{
					Action:        string(portforward.ErrorPortForward),
					ActionPayload: payloadBytes,
				}
			}
		}

	}()

	// Set up the go routine to push regular data to Bastion from the data stream
	go func() {
		defer portforwardSession.dataStream.Close()
		for {
			select {
			case <-doneChan:
				return
			default:
				buf := make([]byte, portforward.DataStreamBufferSize)
				n, err := portforwardSession.dataStream.Read(buf)
				if err == io.EOF {
					p.logger.Error(fmt.Errorf("reviced EOF on datastream: %v", buf[:n]))

					doneChan <- true
					return
				}

				// Now send this data to Bastion
				payload := portforward.KubePortForwardActionPayload{
					RequestId:            p.requestId,
					LogId:                p.logId,
					Data:                 buf[:n],
					PortForwardRequestId: portforwardSession.requestID,
					PodPort:              remotePort,
				}
				payloadBytes, _ := json.Marshal(payload)
				p.RequestChannel <- plgn.ActionWrapper{
					Action:        string(portforward.DataInPortForward),
					ActionPayload: payloadBytes,
				}
			}
		}
	}()

	// We have to keep track of error and data seq numbers and keep a buffer
	expectedDataSeqNumber := 0
	expectedErrorSeqNumber := 0
	dataBuffer := make(map[int][]byte)
	errorBuffer := make(map[int][]byte)

	// Set up our message processors
	processDataMessage := func(content []byte) {
		if _, err := io.Copy(portforwardSession.dataStream, bytes.NewReader(content)); err != nil {
			rerr := fmt.Errorf("error writing to stream data: %s", err)
			p.logger.Error(rerr)

			doneChan <- true
		}
		expectedDataSeqNumber += 1
	}

	processErrorMessage := func(content []byte) {
		if _, err := io.Copy(portforwardSession.errorStream, bytes.NewReader(content)); err != nil {
			rerr := fmt.Errorf("error writing to stream error: %s", err)
			p.logger.Error(rerr)

			// Do not close the stream if the error stream ends
			doneChan <- true
		}
		expectedErrorSeqNumber += 1
	}

	// Get our chan
	requestMapChannel, ok := p.getRequestMap(portforwardSession.requestID)
	if !ok {
		p.logger.Error(fmt.Errorf("error getting stream for request: %s", portforwardSession.requestID))
		return errors.New("unable to find stream channel")
	}

	// Set up the function to listen to bastion messages and push to the user
	for {

		select {
		case <-doneChan:
			// Delete the stream pair from our mapping
			p.deleteRequestMap(portforwardSession.requestID)

			// Return
			return nil
		case requestMapStruct := <-requestMapChannel:
			// contentBytes, _ := base64.StdEncoding.DecodeString(streamMessage.Content)

			switch requestMapStruct.streamMessage.Type {
			case string(smsg.PortForwardData):
				// Check our seqNumber
				if requestMapStruct.streamMessage.SequenceNumber == expectedDataSeqNumber {
					processDataMessage(requestMapStruct.streamMessageContent.Content)
				} else {
					// Update our buffer
					dataBuffer[requestMapStruct.streamMessage.SequenceNumber] = requestMapStruct.streamMessageContent.Content
				}

				// Always attempt to processes out of order messages
				outOfOrderDataContent, ok := dataBuffer[expectedDataSeqNumber]
				for ok {
					// Keep pulling older messages
					processDataMessage(outOfOrderDataContent)
					outOfOrderDataContent, ok = dataBuffer[expectedDataSeqNumber]
				}

			case string(smsg.PortForwardError):
				if requestMapStruct.streamMessage.SequenceNumber == expectedErrorSeqNumber {
					processErrorMessage(requestMapStruct.streamMessageContent.Content)
				} else {
					// Update our buffer
					errorBuffer[requestMapStruct.streamMessage.SequenceNumber] = requestMapStruct.streamMessageContent.Content
				}

				// Always attempt to process out of order messages
				outOfOrderErrorContent, ok := errorBuffer[expectedErrorSeqNumber]
				for ok {
					// Keep pulling older messages
					processErrorMessage(outOfOrderErrorContent)
					outOfOrderErrorContent, ok = errorBuffer[expectedErrorSeqNumber]
				}
			}
		}
	}
	return nil
}

// requestID returns the request id for stream.
func (p *PortForwardAction) requestID(stream httpstream.Stream) (string, error) {
	requestID := stream.Headers().Get(kubeutils.PortForwardRequestIDHeader)
	if len(requestID) == 0 {
		return "", errors.New("port forwarding is not supported")
	}
	return requestID, nil
}

func (p *PortForwardAction) PushKSResponse(wrappedAction plgn.ActionWrapper) {
	p.ksResponseChannel <- wrappedAction
}

func (p *PortForwardAction) PushStreamResponse(stream smsg.StreamMessage) {
	// If this is our ready message, send to our ready channel
	if stream.Type == string(portforward.ReadyPortForward) {
		p.streamChannel <- stream
		return
	}

	// Unmarshal our content
	var kubePortforwardStreamMessageContent portforward.KubePortForwardStreamMessageContent
	contentBytes, _ := base64.StdEncoding.DecodeString(stream.Content)
	err := json.Unmarshal(contentBytes, &kubePortforwardStreamMessageContent)
	if err != nil {
		p.logger.Error(fmt.Errorf("error unmarsheling stream output for portforward action: %+v", err))
		return
	}

	// First get the stream
	streamChan, ok := p.getRequestMap(kubePortforwardStreamMessageContent.PortForwardRequestId)
	if !ok {
		p.logger.Error(fmt.Errorf("unable to find stream chan for request: %s", kubePortforwardStreamMessageContent.PortForwardRequestId))
		return
	}
	streamChan <- RequsetMapStruct{
		streamMessageContent: kubePortforwardStreamMessageContent,
		streamMessage:        stream,
	}
}

// Helper function so we avoid writing to this map at the same time
func (p *PortForwardAction) updateRequestMap(newStreamChan chan RequsetMapStruct, key string) {
	p.requestMapLock.Lock()
	p.requestMap[key] = newStreamChan
	p.requestMapLock.Unlock()
}

func (p *PortForwardAction) deleteRequestMap(key string) {
	p.requestMapLock.Lock()
	delete(p.requestMap, key)
	p.requestMapLock.Unlock()
}

func (p *PortForwardAction) getRequestMap(key string) (chan RequsetMapStruct, bool) {
	p.requestMapLock.Lock()
	defer p.requestMapLock.Unlock()
	act, ok := p.requestMap[key]
	return act, ok
}
