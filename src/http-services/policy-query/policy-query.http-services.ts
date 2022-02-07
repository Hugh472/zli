import { GetKubePoliciesRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/get-kube-policies.requests';
import { KubernetesRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/kubernetes.requests';
import { TargetPolicyQueryRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/target-policy-query.requests';
import { GetKubernetesPoliciesResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/get-kube-policies.responses';
import { KubernetesResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/kubernetes.responses';
import { ProxyResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/proxy.response';
import { ProxyRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/proxy.requests';
import { TargetPolicyQueryResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/target-policy-query.responses';
import { TargetUser } from '../../../webshell-common-ts/http/v2/policy/types/target-user.types';
import { Verb } from '../../../webshell-common-ts/http/v2/policy/types/verb.types';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class PolicyQueryHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/policy-query/', logger);
    }

    public GetTargetPolicy(targetId: string, targetType: TargetType, verb?: Verb, targetUser?: TargetUser): Promise<TargetPolicyQueryResponse>
    {
        const request: TargetPolicyQueryRequest = {
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

        return this.Post('kubernetes', request);
    }

    public GetKubePolicies(
        clusterId: string,
    ): Promise<GetKubernetesPoliciesResponse>
    {
        const request: GetKubePoliciesRequest = {
            clusterId: clusterId,
        };

        return this.FormPost('get-kube-policies', request);
    }

    public CheckProxy(
        targetId: string,
        remoteHost: string,
        remotePort: number,
        targetType: TargetType
    ): Promise<ProxyResponse>
    {
        const request: ProxyRequest = {
            targetId: targetId,
            targetHost: remoteHost,
            targetPort: remotePort,
            targetType: targetType
        };

        return this.Post('proxy', request);
    }
}