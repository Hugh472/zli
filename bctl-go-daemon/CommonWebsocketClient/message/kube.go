/*
This package defines all of the action payload structure associated
with the kube plugin.  Messages defined are for both request and response
and organized by "Action" (e.g. "restapi", "exec", "log")
*/
package message

// For "kube/restapi" actions
type KubeRestApiActionPayload struct { // What are each of these things?
	LogId       string            `json:"logId"`
	KubeCommand string            `json:"kubeCommand"`
	Endpoint    string            `json:"endpoint"`
	Headers     map[string]string `json:"Headers"`
	Method      string            `json:"Method"`
	Body        []byte            `json:"Body"`
	RequestId   uint32            `json:"requestId"` // Just in case it needs to return a stream
}

type KubeRestApiActionResponsePayload struct {
	StatusCode int               `json:"statusCode"`
	Headers    map[string]string `json:"headers"`
	Content    []byte            `json:"content"`
}

// For "kube/resize"
type KubeResizeActionPayload struct {
	Width  uint16 `json:"width"`
	Height uint16 `json:"height"`
}

// For "kube/exec" actions

// For "kube/exec/start"
type KubeExecStartActionPayload struct {
	Command   []string `json:"command"` // what does this look like? Does it contain flags?
	Endpoint  string   `json:"endpoint"`
	RequestId uint32   `json:"requestId"`
}

// For "kube/exec/input"
type KubeExecInputActionPayload struct {
	Stdin     []byte `json:"stdin"`
	RequestId uint32 `json:"requestId"`
}
