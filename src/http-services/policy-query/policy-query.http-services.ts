import { KubernetesPolicyQueryResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/kubernetes-policy-query.responses';
import { ProxyPolicyQueryResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/proxy-policy-query.response';
import { TargetConnectPolicyQueryResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/target-connect-policy-query.responses';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { TunnelsResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';
import { URLSearchParams } from 'url';

export class PolicyQueryHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/policy-query/', logger);
    }

    public TargetConnectPolicyQuery(targets: string[], targetType: TargetType, userEmail?: string): Promise<{[key: string]: TargetConnectPolicyQueryResponse}>
    {
        const queryParams: URLSearchParams = new URLSearchParams({
            targetType: targetType
        });

        // Add optional userEmail query param if provided
        if(userEmail) {
            queryParams.append('userEmail', userEmail);
        }

        // Add list of targets to query params
        targets.forEach(t => queryParams.append('targetIds', t));

        return this.Get('target-connect', queryParams);
    }

    public KubePolicyQuery(clusters: string[], userEmail?: string): Promise<{[key: string]: KubernetesPolicyQueryResponse}>
    {
        const queryParams: URLSearchParams = new URLSearchParams();

        // Add optional userEmail query param if provided
        if(userEmail) {
            queryParams.append('userEmail', userEmail);
        }

        // Add list of clusters to query params
        clusters.forEach(cluster => queryParams.append('clusters', cluster));

        return this.Get('kubernetes', queryParams);
    }

    public ProxyPolicyQuery(targets: string[], targetType: TargetType, userEmail?: string): Promise<{[key: string]: ProxyPolicyQueryResponse}>
    {
        const queryParams: URLSearchParams = new URLSearchParams({
            targetType: targetType
        });

        // Add optional userEmail query param if provided
        if(userEmail) {
            queryParams.append('userEmail', userEmail);
        }

        // Add list of targets to query params
        targets.forEach(t => queryParams.append('targetIds', t));

        return this.Get('proxy', queryParams);


    }

    public GetTunnels(): Promise<TunnelsResponse[]> {
        return this.Get('target-connect/tunnels');
    }
}