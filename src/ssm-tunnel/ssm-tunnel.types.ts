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
    ReceiveData = "ReceiveData"
}

export enum SsmTunnelHubOutgoingMessages {
    StartTunnel = "StartTunnel",
    AddSshPubKey = "AddSshPubKey",
    SendData = "SendData"
}
