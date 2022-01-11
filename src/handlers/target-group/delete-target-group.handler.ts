import { PolicyService } from '../../services/v1/policy/policy.service';
import { PolicyType, KubernetesPolicyContext } from '../../services/v1/policy/policy.types';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';

export async function deleteTargetGroupHandler(targetGroupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First get the existing policy
    const policyService = new PolicyService(configService, logger);
    const policies = await policyService.ListAllPolicies();

    // Loop till we find the one we are looking for
    const policy = policies.find(p => p.name == policyName);

    if (!policy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    switch (policy.type) {
    case PolicyType.KubernetesTunnel:
        // Now check if the group exists
        const kubernetesPolicyContext = policy.context as KubernetesPolicyContext;
        if (kubernetesPolicyContext.clusterGroups[targetGroupName] === undefined) {
            logger.error(`No group ${targetGroupName} exists for policy: ${policyName}`);
            await cleanExit(1, logger);
        }
        // Then remove the group from the policy if it exists
        delete kubernetesPolicyContext.clusterGroups[targetGroupName];

        // And finally update the policy
        policy.context = kubernetesPolicyContext;
        break;
    default:
        logger.error(`Delete target group from policy ${policyName} failed. Deleting target groups from ${policy.type} policies is not currently supported.`);
        await cleanExit(1, logger);
        break;
    }

    await policyService.EditPolicy(policy);

    logger.info(`Deleted ${targetGroupName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}

