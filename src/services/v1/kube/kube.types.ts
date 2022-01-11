import { AgentStatus } from "../../../../webshell-common-ts/http/v2/target/kube/types/agent-status.types";

export interface ClusterSummary {
    id: string;
    clusterName: string;
    status: AgentStatus;
    environmentId?: string;
    validUsers: string[];
    agentVersion: string;
    lastAgentUpdate: Date;
}

export interface ClusterDetails
{
    id: string;
    name: string;
    status: AgentStatus;
    environmentId: string;
    targetUsers: string[];
    lastAgentUpdate: Date;
    agentVersion: string;
}

export interface StatusResponse {
    ExitMessage: string;
}