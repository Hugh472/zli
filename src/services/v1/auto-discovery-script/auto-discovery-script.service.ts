import { ConfigService } from '../../config/config.service';
import { Logger } from '../../logger/logger.service';
import { OperatingSystem } from './auto-discovery-script.types';
import { getAutodiscoveryScriptTargetNameScript } from '../../../../webshell-common-ts/autodiscovery-script/autodiscovery-script';
import { TargetName } from '../../../../webshell-common-ts/autodiscovery-script/autodiscovery-script.types';
import { AutoDiscoveryScriptHttpService } from '../../../http-services/auto-discovery-script/auto-discovery-script.http-services';
import { ScriptTargetNameOption } from '../../../../webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
// export class AutoDiscoveryScriptService extends HttpService {
//     constructor(configService: ConfigService, logger: Logger) {
//         super(configService, 'api/v1/AutodiscoveryScript', logger);
//     }

//     public getAutodiscoveryScript(
//         operatingSystem: string,
//         targetNameScript: string,
//         environmentId: string,
//         agentVersion: string
//     ): Promise<GetAutodiscoveryScriptResponse> {
//         const request: GetAutodiscoveryScriptRequest = {
//             apiUrl: `${this.configService.serviceUrl()}api/v1/`,
//             targetNameScript: targetNameScript,
//             envId: environmentId,
//             agentVersion: agentVersion
//         };

//         return this.Post(`${operatingSystem}`, request);
//     }
// }

export async function getAutodiscoveryScript(
    logger: Logger,
    configService: ConfigService,
    environmentId: string,
    scriptTargetNameOption: ScriptTargetNameOption,
    operatingSystem: OperatingSystem,
    agentVersion: string
) {
    const autodiscoveryScriptHttpService = new AutoDiscoveryScriptHttpService(configService, logger);
    const scriptResponse = await autodiscoveryScriptHttpService.GetAutodiscoveryScript(scriptTargetNameOption, environmentId, agentVersion);

    return scriptResponse.autodiscoveryScript;
}