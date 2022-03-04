import { SsmTargetSummary } from '../../../../webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { ConfigService } from '../../../services/config/config.service';
import { HttpService } from '../../../services/http/http.service';
import { Logger } from '../../../services/logger/logger.service';

export class SsmTargetHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/targets/ssm/', logger);
    }

    public GetSsmTarget(targetId: string): Promise<SsmTargetSummary> {
        return this.Get(targetId);
    }

    public DeleteSsmTarget(targetId: string): Promise<void> {
        return this.Delete(targetId);
    }

    public ListSsmTargets(showDynamic: boolean): Promise<SsmTargetSummary[]> {
        return this.Get('', {showDynamicAccessTargets: String(showDynamic)});
    }
}