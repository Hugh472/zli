package controlchannel

type NewDatachannelMessage struct {
	ConnectionId string   `json:"connectionId"`
	TargetUser   string   `json:"targetUser"`
	TargetGroups []string `json:"targetGroups"`
	Token        string   `json:"token"`
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
	ClusterId      string `json:"clusterId"`
}

type HealthCheckMessage struct {
	ClusterName string `json:"clusterName"`
}
