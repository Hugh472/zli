import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { DbTargetSummary } from '../../../webshell-common-ts/http/v2/target/db/types/db-target-summary.types';

export class DbTargetService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/database', logger);
    }

    public ListDbTargets(): Promise<DbTargetSummary[]> {
        return this.Get('', {});
    }
}