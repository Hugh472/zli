import { TargetStatus } from "../common.types";

export interface ClusterSummary {
    id: string;
    clusterName: string;
    status: TargetStatus;
    environmentId?: string;
    validUsers: string[];
    agentVersion: string;
    lastAgentUpdate: Date;
}

export interface ClusterDetails
{
    id: string;
    name: string;
    status: TargetStatus;
    environmentId: string;
    targetUsers: string[];
    lastAgentUpdate: Date;
    agentVersion: string;
}

export interface StatusResponse {
    ExitMessage: string;
}