import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';

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
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubeTunnelPolicies();
    const targetPolicies = await policyHttpService.ListTargetConnectPolicies();

    const policies = [...kubePolicies, ...targetPolicies];
    const matchingPolicyToEdit = policies.find(p => p.name === policyName);

    if (!matchingPolicyToEdit) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    // If this group does not exist in this policy
    if (! matchingPolicyToEdit.groups.find(g => g.name == groupSummary.name)) {
        logger.error(`Group ${groupName} does not exist for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then delete the group from the policy
    matchingPolicyToEdit.groups = matchingPolicyToEdit.groups.filter(g => g.name !== groupSummary.name);

    // And finally update the policy
    if (matchingPolicyToEdit.type === 'KubernetesTunnel')
        await policyHttpService.EditKubeTunnelPolicy(matchingPolicyToEdit);
    else
        await policyHttpService.EditTargetConnectPolicy(matchingPolicyToEdit);

    logger.info(`Deleted ${groupName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}