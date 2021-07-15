package websocketClient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"

	"bastionzero.com/bctl-daemon/v1/websocketClient/websocketClientTypes"
	"github.com/gorilla/websocket"
)

// This will be the client that we use to store our websocket connection
type WebsocketClient struct {
	Client               *websocket.Conn
	IsServer             bool
	IsReady              bool
	SignalRTypeNumber    int
	DataToClientChan     chan websocketClientTypes.DataToClientMessage
	RequestForServerChan chan websocketClientTypes.RequestForServerSignalRMessage
	SocketLock           sync.Mutex // Ref: https://github.com/gorilla/websocket/issues/119#issuecomment-198710015
}

const messageTerminator byte = 0x1E

type UniqueRand struct {
	generated map[int]bool
}

func NewWebsocketClient(authHeader string, sessionId string, assumeRole string, serviceURL string, clientIdentifier string) *WebsocketClient {
	// Constructor to create a new websocket client object
	ret := WebsocketClient{}

	// Make our headers
	headers := make(map[string]string)
	headers["Authorization"] = authHeader

	// Make our params
	params := make(map[string]string)
	params["session_id"] = sessionId

	// If we are the client, pass the assume_role info as well to the params
	if assumeRole != "" {
		params["assume_role"] = assumeRole
		ret.IsServer = false
	}

	// If we are the server, pass the clientIdentifier info to the params
	if clientIdentifier != "" {
		params["client_identifier"] = clientIdentifier
		ret.IsServer = true

		// Servers are always ready as they start the connnection
		ret.IsReady = true
	}

	// First negotiate in order to get a url to connect to
	httpClient := &http.Client{}
	negotiateUrl := "https://" + serviceURL + "/api/v1/hub/kube/negotiate"
	req, _ := http.NewRequest("POST", negotiateUrl, nil)

	// Add the expected headers
	for name, values := range headers {
		// Loop over all values for the name.
		req.Header.Set(name, values)
	}

	// Set any query params
	q := req.URL.Query()
	for key, values := range params {
		q.Add(key, values)
	}

	// Add our clientProtocol param
	q.Add("clientProtocol", "1.5")
	req.URL.RawQuery = q.Encode()

	// Make the request and wait for the body to close
	log.Printf("Starting negotiation with URL %s", negotiateUrl)
	res, _ := httpClient.Do(req)
	defer res.Body.Close()

	// Extract out the connection token
	bodyBytes, _ := ioutil.ReadAll(res.Body)
	var m map[string]interface{}
	err := json.Unmarshal(bodyBytes, &m)
	if err != nil {
		// TODO: Add error handling around this, we should at least retry and then bubble up the error to the user
		panic(err)
	}
	connectionId := m["connectionId"]

	// Add the connection id to the list of params
	params["id"] = connectionId.(string)
	params["clientProtocol"] = "1.5"
	params["transport"] = "WebSockets"

	// Make an interrupt channel
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	// Build our url u , add our params as well
	u := url.URL{Scheme: "wss", Host: serviceURL, Path: "/api/v1/hub/kube"}
	q = u.Query()
	for key, value := range params {
		q.Set(key, value)
	}
	u.RawQuery = q.Encode()

	log.Printf("Negotiation finished, received %d. Connecting to %s", res.StatusCode, u.String())

	// Connect to the websocket, catch any errors
	ret.Client, _, err = websocket.DefaultDialer.Dial(u.String(), http.Header{"Authorization": []string{authHeader}})
	if err != nil {
		log.Fatal("dial:", err)
	}
	// Save the client in the object
	ret.SignalRTypeNumber = 1

	// Add our response channels
	ret.DataToClientChan = make(chan websocketClientTypes.DataToClientMessage)
	ret.RequestForServerChan = make(chan websocketClientTypes.RequestForServerSignalRMessage)

	// Define our protocol and version
	// Ref: https://stackoverflow.com/questions/65214787/signalr-websockets-and-go
	if err = ret.Client.WriteMessage(websocket.TextMessage, append([]byte(`{"protocol": "json","version": 1}`), 0x1E)); err != nil {
		return nil
	}

	// Make a done channel
	done := make(chan struct{})

	// Subscribe to our streams
	go func() {
		defer close(done)
		for {

			_, message, err := ret.Client.ReadMessage()
			if err != nil {
				log.Println("ERROR: ", err)
				return
			}

			// Always trim off the termination char if its there
			if message[len(message)-1] == messageTerminator {
				message = message[0 : len(message)-1]
			}

			// Also check to see if we have multiple messages
			seporatedMessages := bytes.Split(message, []byte{messageTerminator})

			for _, formattedMessage := range seporatedMessages {
				// Route to our handlers based on their target
				if bytes.Contains(formattedMessage, []byte("\"target\":\"DataToClient\"")) {
					log.Printf("Handling incoming DataToClient message")
					dataToClientSignalRMessage := new(websocketClientTypes.DataToClientSignalRMessage)
					err := json.Unmarshal(formattedMessage, dataToClientSignalRMessage)
					if err != nil {
						log.Printf("Error un-marshalling DataToClientSignalRMessage: %s", err)
						return
					}

					// Broadcase this response to our DataToClientChan
					ret.DataToClientChan <- dataToClientSignalRMessage.Arguments[0]
				} else if bytes.Contains(formattedMessage, []byte("\"target\":\"ReadyToClient\"")) {
					log.Printf("Handling incoming ReadyToClient message")
					readyFromServerSignalRMessage := new(websocketClientTypes.ReadyFromServerSignalRMessage)
					err := json.Unmarshal(formattedMessage, readyFromServerSignalRMessage)
					if err != nil {
						log.Printf("Error un-marshalling ReadyFromServerSignalRMessage: %s", err)
						log.Printf(string(formattedMessage))
						return
					}
					if readyFromServerSignalRMessage.Arguments[0].Ready == true {
						ret.IsReady = true
					}
				} else if bytes.Contains(formattedMessage, []byte("\"target\":\"RequestForServer\"")) {
					log.Printf("Handling incoming RequestForServer message")
					requestForServerSignalRMessage := new(websocketClientTypes.RequestForServerSignalRMessage)

					err := json.Unmarshal(formattedMessage, requestForServerSignalRMessage)
					if err != nil {
						log.Printf("Error un-marshalling RequestForServerSignalRMessage: %s", err)
						log.Println(string(formattedMessage))
						fmt.Printf("mystr:\t %v \n", formattedMessage)
						return
					}
					// Broadcase this response to our DataToClientChan
					log.Printf("REQ IDENT: %d", requestForServerSignalRMessage.Arguments[0].RequestIdentifier)
					ret.RequestForServerChan <- *requestForServerSignalRMessage
				} else if bytes.Contains(formattedMessage, []byte("\"target\":\"StartExecToCluster\"")) {
					log.Printf("Handling incoming StartExecToCluster message")
					requestForStartExecToClusterSingalRMessage := new(websocketClientTypes.RequestForStartExecToClusterSingalRMessage)

					err := json.Unmarshal(formattedMessage, requestForStartExecToClusterSingalRMessage)
					if err != nil {
						log.Printf("Error un-marshalling StartExecToCluster: %s", err)
						return
					}

					log.Println(requestForStartExecToClusterSingalRMessage)
					// // Broadcase this response to our DataToClientChan
					// log.Printf("REQ IDENT: %d", requestForServerSignalRMessage.Arguments[0].RequestIdentifier)
					// ret.RequestForServerChan <- *requestForServerSignalRMessage
				} else {
					log.Printf("Unhandled message incoming: %s", formattedMessage)
				}
			}
		}
	}()
	return &ret
}

// Function to send data Bastion from a DataFromClientMessage object
func (client *WebsocketClient) SendDataFromClientMessage(dataFromClientMessage websocketClientTypes.DataFromClientMessage) error {
	if !client.IsServer && client.IsReady {
		// Lock our mutex and setup the unlock
		client.SocketLock.Lock()
		defer client.SocketLock.Unlock()

		log.Printf("Sending data to Bastion")

		// Create the object, add relevent information
		toSend := new(websocketClientTypes.DataFromClientSignalRMessage)
		toSend.Target = "DataFromClient"
		toSend.Arguments = []websocketClientTypes.DataFromClientMessage{dataFromClientMessage}

		// Add the type number from the class
		toSend.Type = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding

		// Marshal our message
		toSendMarshalled, err := json.Marshal(toSend)
		if err != nil {
			return err
		}

		// Write our message
		if err = client.Client.WriteMessage(websocket.TextMessage, append(toSendMarshalled, 0x1E)); err != nil {
			return err
		}
		// client.SignalRTypeNumber++
		return nil
	}
	// TODO: Return error
	return nil
}

func (client *WebsocketClient) SendResponseToDaemonMessage(responseToDaemonMessage websocketClientTypes.ResponseToDaemonMessage) error {
	if client.IsServer && client.IsReady {
		// Lock our mutex and setup the unlock
		client.SocketLock.Lock()
		defer client.SocketLock.Unlock()

		log.Printf("Sending data to Daemon")
		// Create the object, add relevent information
		toSend := new(websocketClientTypes.ResponseToDaemonSignalRMessage)
		toSend.Target = "ResponseToDaemon"
		toSend.Arguments = []websocketClientTypes.ResponseToDaemonMessage{responseToDaemonMessage}

		// Add the type number from the class
		toSend.Type = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding

		// Marshal our message
		toSendMarshalled, err := json.Marshal(toSend)
		if err != nil {
			return err
		}

		// Write our message
		if err = client.Client.WriteMessage(websocket.TextMessage, append(toSendMarshalled, 0x1E)); err != nil {
			return err
		}
		// client.SignalRTypeNumber++
		return nil
	}
	// TODO: Return error
	return nil
}

func (client *WebsocketClient) SendStartExecToBastionMessage(startExecToBastionMessage websocketClientTypes.StartExecToBastionMessage) error {
	if !client.IsServer && client.IsReady {
		// Lock our mutex and setup the unlock
		client.SocketLock.Lock()
		defer client.SocketLock.Unlock()

		log.Printf("Sending data to Cluster")
		// Create the object, add relevent information
		toSend := new(websocketClientTypes.StartExecToBastionSignalRMessage)
		toSend.Target = "StartExecToBastion"
		toSend.Arguments = []websocketClientTypes.StartExecToBastionMessage{startExecToBastionMessage}

		// Add the type number from the class
		toSend.Type = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding

		// Marshal our message
		toSendMarshalled, err := json.Marshal(toSend)
		if err != nil {
			return err
		}

		// Write our message
		if err = client.Client.WriteMessage(websocket.TextMessage, append(toSendMarshalled, 0x1E)); err != nil {
			log.Printf("Something went wrong :(")
			return err
		}
		fmt.Println("send request?")
		// client.SignalRTypeNumber++
		return nil
	}
	// TODO: Return error
	return nil
}

// Helper function to generate a random unique identifier
func (c *WebsocketClient) GenerateUniqueIdentifier() int {
	for {
		i := rand.Intn(10000)
		return i
		// TODO: Implement a unique check
		// if !u.generated[i] {
		// 	u.generated[i] = true
		// 	return i
		// }
	}
}
