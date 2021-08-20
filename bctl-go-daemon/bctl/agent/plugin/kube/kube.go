package kube

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strings"
	"sync"

	exec "bastionzero.com/bctl/v1/bctl/agent/plugin/kube/actions/exec"
	logaction "bastionzero.com/bctl/v1/bctl/agent/plugin/kube/actions/logs"
	rest "bastionzero.com/bctl/v1/bctl/agent/plugin/kube/actions/restapi"
	plgn "bastionzero.com/bctl/v1/bzerolib/plugin"
	smsg "bastionzero.com/bctl/v1/bzerolib/stream/message"
)

const (
	impersonateGroup = "system:authenticated"
)

type IKubeAction interface {
	InputMessageHandler(action string, actionPayload []byte) (string, []byte, error)
	Closed() bool
}

type JustRequestId struct {
	RequestId string `json:"requestId"`
}

type KubeAction string

const (
	Exec    KubeAction = "exec"
	Log     KubeAction = "log"
	RestApi KubeAction = "restapi"
)

type KubePlugin struct {
	role                string
	streamOutputChannel chan smsg.StreamMessage
	serviceAccountToken string
	kubeHost            string
	actions             map[string]IKubeAction
	actionsMapLock      sync.RWMutex
}

func NewPlugin(ch chan smsg.StreamMessage, role string) plgn.IPlugin {
	// First load in our Kube variables
	// TODO: Where should we save this, in the class? is this the best way to do this?
	// TODO: Also we should be able to drop this req, and just load `IN CLUSTER CONFIG`
	serviceAccountTokenPath := os.Getenv("KUBERNETES_SERVICE_ACCOUNT_TOKEN_PATH")
	serviceAccountTokenBytes, _ := ioutil.ReadFile(serviceAccountTokenPath)
	// TODO: Check for error
	serviceAccountToken := string(serviceAccountTokenBytes)
	kubeHost := "https://" + os.Getenv("KUBERNETES_SERVICE_HOST")

	return &KubePlugin{
		role:                role,
		streamOutputChannel: ch,
		serviceAccountToken: serviceAccountToken,
		kubeHost:            kubeHost,
		actions:             make(map[string]IKubeAction),
	}
}

func (k *KubePlugin) GetName() plgn.PluginName {
	return plgn.Kube
}

func (k *KubePlugin) PushStreamInput(smessage smsg.StreamMessage) error {
	return fmt.Errorf("")
}

func (k *KubePlugin) InputMessageHandler(action string, actionPayload []byte) (string, []byte, error) {
	// Get the action so we know where to send the payload
	log.Printf("Plugin received Data message with %v action", action)
	x := strings.Split(action, "/")
	if len(x) < 2 {
		return "", []byte{}, fmt.Errorf("malformed action: %s", action)
	}
	kubeAction := x[1]

	// TODO: The below line removes the extra, surrounding quotation marks that get added at some point in the marshal/unmarshal
	// so it messes up the umarshalling into a valid action payload.  We need to figure out why this is happening
	// so that we can murder its family
	if len(actionPayload) > 0 {
		actionPayload = actionPayload[1 : len(actionPayload)-1]
	}

	// Json unmarshalling encodes bytes in base64
	actionPayloadSafe, _ := base64.StdEncoding.DecodeString(string(actionPayload))

	// Rest api requests are single request -> response, not interactive
	if KubeAction(kubeAction) == RestApi {
		a, _ := rest.NewRestApiAction(k.serviceAccountToken, k.kubeHost, impersonateGroup, k.role)
		return a.InputMessageHandler(action, actionPayloadSafe)
	}

	// Interactive commands like exec and log need to be able to recieve multiple inputs, so we start them and track them
	// and send any new messages with the same request ID to the existing action object

	// Grab just the request Id so that we can look up whether it's associated with a previously started action object
	var d JustRequestId
	if err := json.Unmarshal(actionPayloadSafe, &d); err != nil {
		return "", []byte{}, fmt.Errorf("could not unmarshal json: %v", err.Error())
	}
	if act, ok := k.actions[d.RequestId]; ok {
		action, payload, err := act.InputMessageHandler(action, actionPayloadSafe)

		// Check if that last message closed the action, if so delete from map
		if act.Closed() {
			delete(k.actions, d.RequestId)
		}
		return action, payload, err
	} else {
		// Create an action object if we don't already have one for the incoming request id
		var a IKubeAction
		var err error
		switch KubeAction(kubeAction) {
		case Exec:
			a, err = exec.NewExecAction(k.serviceAccountToken, k.kubeHost, impersonateGroup, k.role, k.streamOutputChannel)
		case Log:
			a, err = logaction.NewLogAction(k.serviceAccountToken, k.kubeHost, impersonateGroup, k.role, k.streamOutputChannel)
		}
		if err != nil {
			return "", []byte{}, fmt.Errorf("could not start new action object: %v", err.Error())
		}

		// Send the payload to the action and add it to the map for future incoming requests
		action, payload, err := a.InputMessageHandler(action, actionPayloadSafe)
		k.updateActionsMap(a, d.RequestId)
		return action, payload, err
	}
}

// Helper function so we avoid writing to this map at the same time
func (k *KubePlugin) updateActionsMap(newAction IKubeAction, id string) {
	k.actionsMapLock.Lock()
	k.actions[id] = newAction
	k.actionsMapLock.Unlock()
}
