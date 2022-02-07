import { TargetBase } from '../../../webshell-common-ts/http/v2/target/types/target.base';

export interface WebTargetSummary extends TargetBase {
    lastAgentUpdate: Date;
    localPort: number;
    localHost: string;
    remotePort: number;
    remoteHost: string;
}