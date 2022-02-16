import { TargetUser } from '../../services/common.types';
import { PolicyService } from '../../services/v1/policy/policy.service';
import { PolicyType, KubernetesPolicyContext, TargetConnectContext } from '../../services/v1/policy/policy.types';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';

export async function deleteTargetUserHandler(targetUserName: string, policyName: string, configService: ConfigService, logger: Logger) {
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
        // Now check if the targetUser exists
        const kubernetesPolicyContext = policy.context as KubernetesPolicyContext;
        if (kubernetesPolicyContext.clusterUsers[targetUserName] === undefined) {
            logger.error(`No target user ${targetUserName} exists for policy: ${policyName}`);
            await cleanExit(1, logger);
        }
        // Then remove the targetUser from the policy if it exists
        delete kubernetesPolicyContext.clusterUsers[targetUserName];

        // And finally update the policy
        policy.context = kubernetesPolicyContext;
        break;
    case PolicyType.TargetConnect:
        const targetConnectContext = policy.context as TargetConnectContext;
        const targetUsers = targetConnectContext.targetUsers as {[targetUser: string]: TargetUser};
        if (targetUsers[targetUserName] === undefined) {
            logger.error(`No target user ${targetUserName} exists for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // Then remove the targetUser from the policy if it exists
        delete targetUsers[targetUserName];
        targetConnectContext.targetUsers = targetUsers;

        // And finally update the policy
        policy.context = targetConnectContext;
        break;
    default:
        logger.error(`Delete target user from policy ${policyName} failed. Deleting target users from ${policy.type} policies is not currently supported.`);
        await cleanExit(1, logger);
        break;
    }

    await policyService.EditPolicy(policy);

    logger.info(`Deleted ${targetUserName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}

