import { ScriptResponse } from "http/v2/autodiscovery-script/responses/script.responses";
import { ConfigService } from "services/config/config.service";
import { HttpService } from "services/http/http.service";
import { Logger } from "services/logger/logger.service";

export class AutoDiscoveryScriptHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/autodiscovery-scripts', logger);
    }

    public getAutodiscoveryScript(
        targetNameScript: string,
        environmentId: string,
        agentVersion: string
    ): Promise<ScriptResponse> {
        return this.Get(
            'universal',
            {
                apiUrl: `${this.configService.serviceUrl()}api/v2/`,
                targetNameScript: targetNameScript,
                envId: environmentId,
                agentVersion: agentVersion
            });
    }
}