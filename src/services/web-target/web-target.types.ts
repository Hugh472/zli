import { TargetBase } from "../common.types";

export interface WebTargetSummary extends TargetBase {
    agentVersion: string;
    lastAgentUpdate: Date;
    localPort: number;
    localHost: string;
    remotePort: number;
    remoteHost: string;
}