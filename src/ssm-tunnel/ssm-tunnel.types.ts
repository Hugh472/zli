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
}
