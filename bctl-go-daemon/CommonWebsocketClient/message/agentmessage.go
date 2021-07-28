/*
This package defines all of the messages that are used at the AgentMessage level.
It defines the different types of messages (MessageType) and correlated payload
structs: the 4 types of keysplitting messages and agent output streams.
*/
package message

type AgentMessage struct {
	MessageType    string      `json:"messageType"`
	RequestID      uint32      `json:"requestId"`
	SequenceID     uint32      `json:"sequenceId"`
	MessagePayload interface{} `json:"messagePayload"`
}

// The different categories of messages we might send/receive
type MessageType string

const (
	// All keysplittings messages: Syn, SynAck, Data, DataAck
	Keysplitting MessageType = "keysplitting"

	// Agent output stream message types
	Stream MessageType = "stream"

	// Meta control message types that do not have corresponding
	// payload definitions
	Ready MessageType = "ready"
	Stop  MessageType = "stop"
)

// Definitions for MessagePayloads

// Agent Output Streaming Messages

type StreamMessage struct {
	Type    string `json:"type"`
	Content []byte `json:"content"`
}

// Type restriction on our different kinds of agent
// output streams.  StdIn will come in the form of a
// Keysplitting DataMessage
type StreamType string

const (
	StdErr StreamType = "stderr"
	StdOut StreamType = "stdout"
)

// Keysplitting Messages: Syn, SynAck, Data, DataAck
// as well as BZCert

type KeysplittingMessage struct {
	KeysplittingPayload interface{} `json:"payload"`
	Signature           string      `json:"signature"`
}

// Repetition in Keysplitting messages is requires to maintain flat
// structure which is important for hashing
type SynPayload struct {
	Timestamp     int64  `json:"timestamp"` // Unix time
	SchemaVersion string `json:"schemaVersion"`
	Type          string `json:"type"`
	Action        string `json:"action"`

	// Unique to Syn
	TargetId string `json:"targetId"`
	Nonce    string `json:"nonce"`
	BZCert   BZCert `json:"BZCert"`
}

type SynAckPayload struct {
	Timestamp     int64  `json:"timestamp"` // Unix time
	SchemaVersion string `json:"schemaVersion"`
	Type          string `json:"type"`
	Action        string `json:"action"`

	// Unique to SynAck
	TargetPublicKey string `json:"targetPublicKey"`
	Nonce           string `json:"nonce"`
	HPointer        string `json:"hPointer"`
}

type DataPayload struct {
	Timestamp     int64  `json:"timestamp"` // Unix time
	SchemaVersion string `json:"schemaVersion"`
	Type          string `json:"type"`
	Action        string `json:"action"`

	//Unique to Data
	TargetId      string `json:"targetId"`
	HPointer      string `json:"hPointer"`
	BZCertHash    string `json:"bZCertHash"`
	ActionPayload []byte `json:"actionPayload"`
}

type DataAckPayload struct {
	Timestamp     int64  `json:"timestamp"` // Unix time
	SchemaVersion string `json:"schemaVersion"`
	Type          string `json:"type"`
	Action        string `json:"action"`

	//Unique to DataAck
	TargetPublicKey       string `json:"targetPublicKey"`
	HPointer              string `json:"hPointer"`
	ActionResponsePayload []byte `json:"actionResponsePayload"`
}

type BZCert struct {
	InitialIdToken  string `json:"initialIdToken"`
	CurrentIdToken  string `json:"currentIdToken"`
	ClientPublicKey string `json:"clientPublicKey"`
	Rand            string `json:"rand"`
	SignatureOnRand string `json:"signatureOnRand"`
}

// Type restrictions for keysplitting messages
type KeysplittingType string

const (
	Syn     KeysplittingType = "Syn"
	SynAck  KeysplittingType = "SynAck"
	Data    KeysplittingType = "Data"
	DataAck KeysplittingType = "DataAck"
)
