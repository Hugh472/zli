import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';


export interface CreateConnectionRequest {
    sessionId: string;
    serverId: string;
    serverType: TargetType;
    username: string;
}

export interface CreateConnectionResponse {
    connectionId: string;
}

export interface CloseConnectionRequest {
    connectionId: string;
}

export interface CloseConnectionResponse {
}