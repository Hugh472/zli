import { AddNewAgentRequest } from '../../../../webshell-common-ts/http/v2/target/kube/requests/add-new-agent.requests';
import { KubeGetAgentYamlResponse } from '../../../../webshell-common-ts/http/v2/target/kube/responses/kube-get-agent-yaml.response';
import { KubeClusterSummary } from '../../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { ConfigService } from '../../../services/config/config.service';
import { HttpService } from '../../../services/http/http.service';
import { Logger } from '../../../services/logger/logger.service';

export class KubeHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/kube', logger);
    }

    public CreateNewAgentToken(
        name: string,
        labels: { [index: string ]: string },
        namespace: string,
        environmentId: string,
    ): Promise<KubeGetAgentYamlResponse>
    {
        const request: AddNewAgentRequest = {
            name: name,
            labels: labels,
            namespace: namespace,
            environmentId: environmentId,
        };
        return this.Post('', request);
    }

    public ListKubeClusters(): Promise<KubeClusterSummary[]> {
        return this.Get();
    }

    public GetKubeCluster(clusterTargetId: string): Promise<KubeClusterSummary> {
        return this.Get(clusterTargetId);
    }

    public DeleteKubeCluster(id : string): Promise<void> {
        return this.Delete(id);
    }
}