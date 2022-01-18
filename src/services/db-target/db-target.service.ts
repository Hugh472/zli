import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { DbTargetSummary } from './db-target.types';

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