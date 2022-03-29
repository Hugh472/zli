import { PolicyHttpService } from "../../http-services/policy/policy.http-services";
import { BasePolicySummary } from "../../../webshell-common-ts/http/v2/policy/types/base-policy-summary.types";
import { ConfigService } from "../config/config.service";
import { Logger } from "../logger/logger.service";

export async function listAllPolicies(configService: ConfigService,
    logger: Logger,
    listOrganizationControlPolicies: boolean = true,
    listSessionRecordingPolicies: boolean = true,
    listProxyPolicies: boolean = true,
    listKubernetesPolicies: boolean = true,
    listTargetConnectPolicies: boolean = true,
    ) : Promise<BasePolicySummary[]> {

    const policyHttpService = new PolicyHttpService(configService, logger);

    let kubernetesPolicies: BasePolicySummary[] = [];
    let targetConnectPolicies: BasePolicySummary[] = [];
    let sessionRecordingPolicies: BasePolicySummary[] = [];
    let organizationControlPolicies: BasePolicySummary[] = [];
    let proxyPolicies: BasePolicySummary[] = [];

    if (listOrganizationControlPolicies)
        organizationControlPolicies = await policyHttpService.ListOrganizationControlPolicies();

    if (listSessionRecordingPolicies)
        sessionRecordingPolicies = await policyHttpService.ListSessionRecordingPolicies();
    
    if (listProxyPolicies)
        proxyPolicies = await policyHttpService.ListProxyPolicies();

    if (listKubernetesPolicies)
        kubernetesPolicies = await policyHttpService.ListKubernetesPolicies();

    if (listTargetConnectPolicies)
        targetConnectPolicies = await policyHttpService.ListTargetConnectPolicies();
        

    return [
        ...kubernetesPolicies,
        ...targetConnectPolicies,
        ...sessionRecordingPolicies,
        ...organizationControlPolicies,
        ...proxyPolicies];
}