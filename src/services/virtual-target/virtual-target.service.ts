import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { DbTargetSummary, WebTargetSummary } from './virtual-target.types';

export class VirtualTargetService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/virtual-target', logger);
    }

    public ListDbTargets(): Promise<DbTargetSummary[]> {
        return this.Get('db', {});
    }
    public ListWebTargets(): Promise<WebTargetSummary[]> {
        return this.Get('web', {});
    }
}