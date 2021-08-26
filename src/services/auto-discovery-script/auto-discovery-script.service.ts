import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { GetAutodiscoveryScriptResponse, GetAutodiscoveryScriptRequest } from './auto-discovery-script.messages';

export class AutoDiscoveryScriptService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v1/AutodiscoveryScript', logger);
    }

    public getAutodiscoveryScript(
        operatingSystem: string,
        targetNameScript: string,
        environmentId: string,
        agentVersion: string
    ): Promise<GetAutodiscoveryScriptResponse>
    {
        const request: GetAutodiscoveryScriptRequest = {
            apiUrl: `${this.configService.serviceUrl()}api/v1/`,
            targetNameScript: targetNameScript,
            envId: environmentId,
            agentVersion: agentVersion
        };

        return this.Post(`${operatingSystem}`, request);
    }
}