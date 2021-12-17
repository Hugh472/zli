import { ConfigService } from '../../config/config.service';
import { HttpService } from '../../http/http.service';
import { Logger } from '../../logger/logger.service';
import { GetAutodiscoveryScriptResponse, GetAutodiscoveryScriptRequest } from './auto-discovery-script.messages';
import { OperatingSystem } from './auto-discovery-script.types';
import { getAutodiscoveryScriptTargetNameScript } from '../../../../webshell-common-ts/autodiscovery-script/autodiscovery-script';
import { TargetName } from '../../../../webshell-common-ts/autodiscovery-script/autodiscovery-script.types';
import { AutoDiscoveryScriptHttpService } from 'http-services/auto-discovery-script/auto-discovery-script.http-services';
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

export async function getAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    targetName: TargetName,
    operatingSystem: OperatingSystem,
    agentVersion: string
) {
    const targetNameScript = getAutodiscoveryScriptTargetNameScript(targetName);

    const autodiscoveryScriptHttpService = new AutoDiscoveryScriptHttpService(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetAutodiscoveryScript(targetNameScript, environmentId, agentVersion);

    return scriptResponse.autodiscoveryScript;
}