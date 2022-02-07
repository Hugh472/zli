import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { BzeroAgentSummary } from '../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';

export class BzeroAgentService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/bzero', logger);
    }

    public ListBzeroAgents(): Promise<BzeroAgentSummary[]> {
        return this.Get('', {});
    }

    public DeleteBzeroAgent(targetId: string): Promise<void> {
        return this.Delete(targetId);
    }
}