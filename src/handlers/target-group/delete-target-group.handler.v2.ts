import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';

export async function deleteTargetGroupHandler(targetGroupName: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First get the existing policy
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubeTunnelPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);

    if (!kubePolicy) {
        // Log an error
        logger.error(`Unable to find Kubernetes Tunnel policy with name: ${policyName}. Please make sure ${policyName} is a Kubernetes Tunnel policy.`);
        await cleanExit(1, logger);
    }

    // Now check if the group exists
    if (!kubePolicy.clusterGroups.find(g => g.name === targetGroupName)) {
        logger.error(`No group ${targetGroupName} exists for policy: ${policyName}`);
        await cleanExit(1, logger);
    }
    
    // And finally update the policy
    kubePolicy.clusterGroups = kubePolicy.clusterGroups.filter(u => u.name !== targetGroupName);

    await policyHttpService.EditKubeTunnelPolicy(kubePolicy);

    logger.info(`Deleted ${targetGroupName} from ${policyName} policy!`);
    await cleanExit(0, logger);
}

