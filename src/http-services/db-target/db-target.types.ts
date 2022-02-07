import { TargetBase } from '../../../webshell-common-ts/http/v2/target/types/target.base';

export interface DbTargetSummary extends TargetBase {
    engine: string;
    lastAgentUpdate: Date;
    localPort: number;
    localHost: string;
    remotePort: number;
    remoteHost: string;
}