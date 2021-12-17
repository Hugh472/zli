import { GetKubePoliciesRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/get-kube-policies.requests';
import { KubeTunnelRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/kube-tunnel.requests';
import { TargetPolicyQueryRequest } from '../../../webshell-common-ts/http/v2/policy-query/requests/target-policy-query.requests';
import { GetKubePoliciesResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/get-kube-policies.responses';
import { KubeTunnelResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/kube-tunnel.responses';
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

    public CheckKubeTunnel(
        targetUser: string,
        clusterId: string,
        targetGroups: string[],
    ): Promise<KubeTunnelResponse>
    {
        const request: KubeTunnelRequest = {
            clusterId: clusterId,
            targetUser: targetUser,
            targetGroups: targetGroups,
        };

        return this.Post('kube-tunnel', request);
    }

    public GetKubePolicies(
        clusterId: string,
    ): Promise<GetKubePoliciesResponse>
    {
        const request: GetKubePoliciesRequest = {
            clusterId: clusterId,
        };

        return this.FormPost('get-kube-policies', request);
    }
}