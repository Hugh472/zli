import { GroupSummary } from '../../services/v1/groups/groups.types';
import { PolicyService } from '../../services/v1/policy/policy.service';
import { PolicyType, Group, KubePolicySummary } from '../../services/v1/policy/policy.types';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { KubeTunnelPolicySummary } from '../../../webshell-common-ts/http/v2/policy/kubernetes-tunnel/types/kube-tunnel-policy-summary.types';
import { TargetConnectPolicySummary } from '../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';

export async function addGroupToPolicyHandler(groupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the group
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.ListGroups();
    let groupSummary : GroupSummary = undefined;
    for (const group of groups){
        if (group.name == groupName)
            groupSummary = group;
    }
    if (groupSummary == undefined) {
        logger.error(`Unable to find group with name: ${groupName}`);
        await cleanExit(1, logger);
    }

    // Get the existing policy
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubeTunnelPolicies();
    const targetPolicies = await policyHttpService.ListTargetConnectPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);
    const targetPolicy = targetPolicies.find(p => p.name == policyName);

    if (!kubePolicy && !targetPolicy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    const policy = kubePolicy ? kubePolicy : targetPolicy;

    // If this group exists already
    const group = policy.groups.find(g => g.name == groupSummary.name);
    if (group) {
        logger.error(`Group ${groupSummary.name} exists already for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then add the group to the policy
    const groupToAdd: Group = {
        id: groupSummary.idPGroupId,
        name: groupSummary.name
    };
    policy.groups.push(groupToAdd);

    // And finally update the policy
    if (kubePolicy)
        await policyHttpService.EditKubeTunnelPolicy(policy as KubeTunnelPolicySummary);
    else
        await policyHttpService.EditTargetConnectPolicy(policy as TargetConnectPolicySummary)

    logger.info(`Added ${groupName} to ${policyName} policy!`);
    await cleanExit(0, logger);
}

