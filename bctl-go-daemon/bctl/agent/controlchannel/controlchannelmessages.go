package controlchannel

type NewDatachannelMessage struct {
	ConnectionId string `json:"connectionId"`
	Role         string `json:"role"`
	Token        string `json:"token"`
}

type AliveCheckClusterToBastionMessage struct {
	Alive        bool     `json:"alive"`
	ClusterUsers []string `json:"clusterUsers"`
}

type RegisterAgentMessage struct {
	PublicKey      string `json:"publicKey"`
	ActivationCode string `json:"activationCode"`
	AgentVersion   string `json:"agentVersion"`
	OrgId          string `json:"orgId"`
	EnvironmentId  string `json:"environmentId"`
	ClusterName    string `json:"clusterName"`
}