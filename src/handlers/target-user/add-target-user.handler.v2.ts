import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { ClusterUser } from '../../../webshell-common-ts/http/v2/policy/types/cluster-user.types';
import { TargetUser } from '../../../webshell-common-ts/http/v2/policy/types/target-user.types';

export async function addTargetUserHandler(targetUserName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First get the existing policy
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

    if (kubePolicy) {
        // If this cluster targetUser exists already
        if (kubePolicy.clusterUsers.find(u => u.name === targetUserName)) {
            logger.error(`Target user ${targetUserName} exists already for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // Then add the targetUser to the policy
        const clusterUserToAdd: ClusterUser = {
            name: targetUserName
        };

        // And finally update the policy
        kubePolicy.clusterUsers.push(clusterUserToAdd);

        await policyHttpService.EditKubeTunnelPolicy(kubePolicy);
    } else if (targetPolicy) {
        // If this cluster targetUser exists already
        if (targetPolicy.targetUsers.find(u => u.userName === targetUserName)) {
            logger.error(`Target user ${targetUserName} exists already for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // Then add the targetUser to the policy
        const targetUserToAdd: TargetUser = {
            userName: targetUserName
        };

        // And finally update the policy
        targetPolicy.targetUsers.push(targetUserToAdd);
        await policyHttpService.EditTargetConnectPolicy(targetPolicy);
    } else {
        logger.error(`Adding target user to policy ${policyName} failed. Adding target users to this policy type is not currently supported.`);
        await cleanExit(1, logger);
    }

    logger.info(`Added ${targetUserName} to ${policyName} policy!`);
    await cleanExit(0, logger);
}