import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { ConnectionEventResponse } from '../../../webshell-common-ts/http/v2/event/response/connection-event-data-message';
import { KubeEventDataResponse } from '../../../webshell-common-ts/http/v2/event/response/kube-event-data-message';


export class EventsHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/events/', logger);
    }

    public GetConnectionEvents(startTime: Date, subjectIds: string[]) : Promise<ConnectionEventResponse[]>
    {
        const params = {
            startTimestamp: startTime.toJSON(),
            subjectIds: subjectIds.toString()
        };
        return this.Get('connection', params);
    }

    public GetKubeEvents() : Promise<KubeEventDataResponse[]>
    {
        return this.Get('kube');
    }
}