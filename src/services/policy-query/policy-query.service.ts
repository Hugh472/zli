import { TargetType, TargetUser } from '../common.types';
import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { GetTargetPolicyResponse, GetTargetPolicyRequest, KubeProxyResponse, KubeProxyRequest, GetAllPoliciesForClusterIdResponse, GetAllPoliciesForClusterIdRequest, DbConnectResponse, DbConnectRequest, WebConnectResponse, WebConnectRequest } from './policy-query.messages';
import { Verb } from './policy-query.types';

export class PolicyQueryService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/policy-query/', logger); // TODO: This needs to change once thanos merges in his pr
    }

    public ListTargetOSUsers(targetId: string, targetType: TargetType, verb?: Verb, targetUser?: TargetUser): Promise<GetTargetPolicyResponse>
    {
        const request: GetTargetPolicyRequest = {
            targetId: targetId,
            targetType: targetType,
            verb: verb,
            targetUser: targetUser
        };

        return this.Post('target-connect', request);
    }

    public CheckKubeProxy(
        targetUser: string,
        clusterId: string,
        targetGroups: string[],
    ): Promise<KubeProxyResponse>
    {
        const request: KubeProxyRequest = {
            clusterId: clusterId,
            targetUser: targetUser,
            targetGroups: targetGroups,
        };

        return this.Post('kube-tunnel', request);
    }

    public CheckDbConnect(
        targetId: string,
        targetHost: string,
        targetPort: number,
        targetHostName: string
    ): Promise<DbConnectResponse>
    {
        const request: DbConnectRequest = {
            targetId: targetId,
            targetHost: targetHost,
            targetPort: targetPort,
            targetHostName: targetHostName,
        };

        return this.Post('db-connect', request);
    }

    public CheckWebConnect(
        targetId: string,
        targetHost: string,
        targetPort: number,
        targetHostName: string
    ): Promise<WebConnectResponse>
    {
        const request: WebConnectRequest = {
            targetId: targetId,
            targetHost: targetHost,
            targetPort: targetPort,
            targetHostName: targetHostName,
        };

        return this.Post('web-connect', request);
    }

    public GetAllPoliciesForClusterId(
        clusterId: string,
    ): Promise<GetAllPoliciesForClusterIdResponse>
    {
        const request: GetAllPoliciesForClusterIdRequest = {
            clusterId: clusterId,
        };

        return this.FormPost('get-kube-policies', request);
    }
}