import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { PolicyType, KubernetesPolicyClusterGroup, KubernetesPolicyContext } from '../../services/v1/policy/policy.types';
import { PolicyService } from '../../services/v1/policy/policy.service';
import { cleanExit } from '../clean-exit.handler';

export async function addTargetGroupHandler(targetGroupName: string, policyName: string, configService: ConfigService, logger: Logger) {
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
    case PolicyType.Kubernetes:
        // Then add the group to the policy
        const clusterGroupToAdd: KubernetesPolicyClusterGroup = {
            name: targetGroupName
        };
        const kubernetesPolicyContext = policy.context as KubernetesPolicyContext;

        // If this cluster group exists already
        if (kubernetesPolicyContext.clusterGroups[targetGroupName] !== undefined) {
            logger.error(`Group ${targetGroupName} exists already for policy: ${policyName}`);
            await cleanExit(1, logger);
        }
        kubernetesPolicyContext.clusterGroups[targetGroupName] = clusterGroupToAdd;

        // And finally update the policy
        policy.context = kubernetesPolicyContext;
        break;
    default:
        logger.error(`Adding target group to policy ${policyName} failed. Adding target group to ${policy.type} policies is not currently supported.`);
        await cleanExit(1, logger);
        break;
    }

    await policyService.EditPolicy(policy);

    logger.info(`Added ${targetGroupName} to ${policyName} policy!`);
    await cleanExit(0, logger);
}