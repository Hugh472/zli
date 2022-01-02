import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { BzeroAgentSummary } from './bzero-agent.types';

export class BzeroAgentService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/targets/bzero', logger);
    }

    public ListBzeroAgents(): Promise<BzeroAgentSummary[]> {
        return this.Get('', {});
    }

    // public GetKubeCluster(clusterTargetId: string): Promise<ClusterSummary> {
    //     return this.Get('', { id: clusterTargetId });
    // }

    // public DeleteKubeCluster(req: DeleteClusterRequest): Promise<void> {
    //     return this.Post('delete', req);
    // }
}