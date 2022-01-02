import { TargetStatus } from "../common.types";

export interface DbTargetSummary {
    id: string;
    targetName: string;
    engine: string;
    status: TargetStatus;
    agentVersion: string;
    lastAgentUpdate: Date;
    localPort: number;
}

export interface WebTargetSummary {
    id: string;
    targetName: string;
    status: TargetStatus;
    agentVersion: string;
    lastAgentUpdate: Date;
}