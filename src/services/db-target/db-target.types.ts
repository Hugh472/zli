import { TargetBase } from '../common.types';

export interface DbTargetSummary extends TargetBase {
    engine: string;
    agentVersion: string;
    lastAgentUpdate: Date;
    localPort: number;
    localHost: string;
    remotePort: number;
    remoteHost: string;
}