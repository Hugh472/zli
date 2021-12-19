import { ScriptResponse } from '../../../webshell-common-ts/http/v2/autodiscovery-script/responses/script.responses';
import { ScriptTargetNameOption } from '../../../webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class AutoDiscoveryScriptHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/autodiscovery-scripts', logger);
    }

    public GetAutodiscoveryScript(
        targetNameOption: ScriptTargetNameOption,
        environmentId: string,
        agentVersion?: string
    ): Promise<ScriptResponse> {
        return this.Get(
            'universal',
            {
                targetNameOption: targetNameOption,
                envId: environmentId,
                agentVersion: agentVersion
            });
    }
}