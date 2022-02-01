import { TargetStatus } from '../../../../webshell-common-ts/http/v2/target/types/target.types';

export interface SsmTargetSummary {
    id: string;
    name: string;
    status: TargetStatus;
    environmentId?: string;
    // ID of the agent (hash of public key)
    // Used as the targetId in keysplitting messages
    agentId: string;
    agentVersion: string;
}