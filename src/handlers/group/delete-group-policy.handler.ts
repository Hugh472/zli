import { PolicyService } from '../../services/v1/policy/policy.service';
import { PolicyType } from '../../services/v1/policy/policy.types';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';

export async function deleteGroupFromPolicyHandler(groupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the group
    const organizationHttpService = new OrganizationHttpService(configService, logger);
    const groups = await organizationHttpService.ListGroups();
    const groupSummary = groups.find(g => g.name == groupName);
    if (groupSummary == undefined) {
        logger.error(`Unable to find group with name: ${groupName}`);
        await cleanExit(1, logger);
    }

    // Get the existing policy
    const policyService = new PolicyService(configService, logger);
    const policies = await policyService.ListAllPolicies();

    const policy = policies.find(p => p.name == policyName);

    if (!policy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    if (policy.type !== PolicyType.Kubernetes && policy.type !== PolicyType.TargetConnect){
        logger.error(`Deleting group from policy ${policyName} failed. Deleting groups from ${policy.type} policies is not currently supported.`);
        await cleanExit(1, logger);
    }

    // Then delete the group from the policy
    // TODO : Here index/splice can be used
    const newGroups = [];
    for (const group of policy.groups) {
        if (group.id != groupSummary.idPGroupId) {
            newGroups.push(group);
        }
    }
    policy.groups = newGroups;

    // And finally update the policy
    await policyService.EditPolicy(policy);

    logger.info(`Deleted ${groupName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}

