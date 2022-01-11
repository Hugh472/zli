import { ConfigService } from '../../config/config.service';
import { HttpService } from '../../http/http.service';
import { Logger } from '../../logger/logger.service';
import { GetKubeUnregisteredAgentYamlResponse, GetKubeUnregisteredAgentYamlRequest, GetUserInfoResponse, GetUserInfoRequest, DeleteClusterRequest } from './kube.messages';
import { ClusterSummary } from './kube.types';

export interface KubeConfig {
    keyPath: string,
    certPath: string,
    csrPath: string,
    token: string,
    localHost: string,
    localPort: number,
    localPid: number,
    targetUser: string,
    targetGroups: string[],
    targetCluster: string,
    defaultTargetGroups: string[]
}

export class KubeService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v1/kube', logger);
    }

    public getKubeUnregisteredAgentYaml(
        clusterName: string,
        labels: { [index: string ]: string },
        namespace: string,
        environmentId: string,
    ): Promise<GetKubeUnregisteredAgentYamlResponse>
    {
        const request: GetKubeUnregisteredAgentYamlRequest = {
            clusterName: clusterName,
            labels: labels,
            namespace: namespace,
            environmentId: environmentId,
        };
        return this.Post('get-agent-yaml', request);
    }

    public GetUserInfoFromEmail(
        email: string
    ): Promise<GetUserInfoResponse>
    {
        const request: GetUserInfoRequest = {
            email: email,
        };

        return this.Post('get-user', request);
    }

    public ListKubeClusters(): Promise<ClusterSummary[]> {
        return this.Get('list', {});
    }

    public GetKubeCluster(clusterTargetId: string): Promise<ClusterSummary> {
        return this.Get('', { id: clusterTargetId });
    }

    public DeleteKubeCluster(req: DeleteClusterRequest): Promise<void> {
        return this.Post('delete', req);
    }
}

export function getDefaultKubeConfig(): KubeConfig {
    return {
        keyPath: null,
        certPath: null,
        csrPath: null,
        token: null,
        localHost: null,
        localPort: null,
        localPid: null,
        targetUser: null,
        targetGroups: null,
        targetCluster: null,
        defaultTargetGroups: null,
    };
}
