import Utils from '../../../webshell-common-ts/utility/utils';
import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { LatencyV1MetricsRequest } from './metrics-http.messages';

export class MetricsHttpService extends HttpService {
    constructor(connectionNodeId: string, configService: ConfigService, logger: Logger) {
        const connectionServiceUrl = Utils.getConnectionNodeUrl(configService.serviceUrl(), connectionNodeId);
        super(configService, 'metrics/', logger, connectionServiceUrl, false);
    }

    public PostLatencyMetricsV1(req: LatencyV1MetricsRequest) : Promise<void> {
        return this.Post('post-latency-metrics-v1', req);
    }
}