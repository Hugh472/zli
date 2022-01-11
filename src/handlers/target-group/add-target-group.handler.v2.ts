import { ClusterGroup } from '../../../webshell-common-ts/http/v2/policy/types/cluster-group.types';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';

export async function addTargetGroupHandler(targetGroupName: string, policyName: string, configService: ConfigService, logger: Logger) {
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

    // If this cluster Group exists already
    if (kubePolicy.clusterGroups.find(g => g.name === targetGroupName)) {
        logger.error(`Group ${targetGroupName} exists already for policy: ${policyName}`);
        await cleanExit(1, logger);
    }

    // Then add the clusterGroup to the policy
    const clusterGroupToAdd: ClusterGroup = {
        name: targetGroupName
    };

    // And finally update the policy
    kubePolicy.clusterGroups.push(clusterGroupToAdd);

    await policyHttpService.EditKubeTunnelPolicy(kubePolicy);

    logger.info(`Added ${targetGroupName} to ${policyName} policy!`);
    await cleanExit(0, logger);
}