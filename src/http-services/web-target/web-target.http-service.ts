import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { WebTargetSummary } from '../../../webshell-common-ts/http/v2/target/web/web-target-summary.types';

export class WebTargetService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/web', logger);
    }

    public ListWebTargets(): Promise<WebTargetSummary[]> {
        return this.Get('', {});
    }
}