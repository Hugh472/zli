import { TargetStatus } from "../common.types";

export interface DbTargetSummary {
    id: string;
    targetName: string;
    engine: string;
    status: TargetStatus;
    agentVersion: string;
    lastAgentUpdate: Date;
    localPort: number;
    targetPort: number;
    targetHost: string;
    targetHostName: string;
}

export interface WebTargetSummary {
    id: string;
    targetName: string;
    status: TargetStatus;
    agentVersion: string;
    lastAgentUpdate: Date;
    targetPort: number;
    targetHost: string;
    targetHostName: string;
}