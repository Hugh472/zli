import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetBase.types';

export interface BzeroAgentSummary {
    id: string;
    name: string;
    status: TargetStatus;
    environmentId?: string;
    agentVersion: string;
    lastAgentUpdate: Date;
    region: string;
}