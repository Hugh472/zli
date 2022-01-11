import { TargetBase } from "../common.types";

export interface DbTargetSummary extends TargetBase {
    engine: string;
    agentVersion: string;
    lastAgentUpdate: Date;
    localPort: number;
    localHost: string;
    remotePort: number;
    remoteHost: string;
}

export interface WebTargetSummary extends TargetBase {
    agentVersion: string;
    lastAgentUpdate: Date;
    localPort: number;
    localHost: string;
    remotePort: number;
    remoteHost: string;
}