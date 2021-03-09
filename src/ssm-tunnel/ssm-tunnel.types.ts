// Maximum receive limit configured for the signalR server
export const HUB_RECEIVE_MAX_SIZE = 32 * 1024;

export interface WebsocketResponse {
    error: boolean;
    errorMessage: string;
}

export interface StartTunnelMessage {
    targetId: string;
    targetPort: number;
    targetUser: string;
}

export interface AddSshPubKeyMessage {
    keyType: string;
    publicKey: string;
}

export interface TunnelDataMessage {
    data: string;
    sequenceNumber: number;
}

export enum SsmTunnelHubIncomingMessages {
    ReceiveData = 'ReceiveData',
    ReceiveSynAck = 'ReceiveSynAck',
    ReceiveDataAck = 'ReceiveDataAck',
    ReceiveError = 'ReceiveError',
}

export enum SsmTunnelHubOutgoingMessages {
    StartTunnel = 'StartTunnel',
    AddSshPubKey = 'AddSshPubKey',
    SendData = 'SendData',
    SynMessage = 'SendSynMessage',
    DataMessage = 'SendDataMessage'
}