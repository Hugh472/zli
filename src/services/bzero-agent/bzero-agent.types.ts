import { TargetStatus } from "../common.types";

export interface BzeroAgentSummary {
    id: string;
    targetName: string;
    status: TargetStatus;
    environmentId?: string;
    agentVersion: string;
    lastAgentUpdate: Date;
}