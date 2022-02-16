import { GroupSummary } from '../../services/v1/groups/groups.types';
import { PolicyService } from '../../services/v1/policy/policy.service';
import { PolicyType, Group } from '../../services/v1/policy/policy.types';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';

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
    const policyService = new PolicyService(configService, logger);
    const policies = await policyService.ListAllPolicies();

    // Loop till we find the one we are looking for
    const policy = policies.find(p => p.name == policyName);

    if (!policy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    if (policy.type !== PolicyType.Kubernetes && policy.type !== PolicyType.TargetConnect){
        logger.error(`Adding group to policy ${policyName} failed. Adding groups to ${policy.type} policies is not currently supported.`);
        await cleanExit(1, logger);
    }

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
    await policyService.EditPolicy(policy);

    logger.info(`Added ${groupName} to ${policyName} policy!`);
    await cleanExit(0, logger);
}

