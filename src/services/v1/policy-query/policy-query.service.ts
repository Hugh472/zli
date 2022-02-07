import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetUser } from '../../common.types';
import { ConfigService } from '../../config/config.service';
import { HttpService } from '../../http/http.service';
import { Logger } from '../../logger/logger.service';
import { GetTargetPolicyResponse, GetTargetPolicyRequest, KubeProxyResponse as KubernetesResponse, KubeProxyRequest as KubernetesRequest, GetAllPoliciesForClusterIdResponse, GetAllPoliciesForClusterIdRequest, ProxyResponse, ProxyRequest } from './policy-query.messages';
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

    public CheckKubernetes(
        targetUser: string,
        clusterId: string,
        targetGroups: string[],
    ): Promise<KubernetesResponse>
    {
        const request: KubernetesRequest = {
            clusterId: clusterId,
            targetUser: targetUser,
            targetGroups: targetGroups,
        };

        return this.Post('kube-tunnel', request);
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