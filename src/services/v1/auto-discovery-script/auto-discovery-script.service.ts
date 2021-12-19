import { ConfigService } from '../../config/config.service';
import { Logger } from '../../logger/logger.service';
import { GetAutodiscoveryScriptRequest, GetAutodiscoveryScriptResponse } from './auto-discovery-script.messages';
import { HttpService } from '../../../services/http/http.service';

export class AutoDiscoveryScriptService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v1/AutodiscoveryScript', logger);
    }

    public getAutodiscoveryScript(
        operatingSystem: string,
        targetNameScript: string,
        environmentId: string,
        agentVersion: string
    ): Promise<GetAutodiscoveryScriptResponse> {
        const request: GetAutodiscoveryScriptRequest = {
            apiUrl: `${this.configService.serviceUrl()}api/v1/`,
            targetNameScript: targetNameScript,
            envId: environmentId,
            agentVersion: agentVersion
        };

        return this.Post(`${operatingSystem}`, request);
    }
}
