import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary } from '../../utils/utils';
import { TargetSummary, TargetType } from '../common.types';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { VerbType } from '../v1/policy-query/policy-query.types';
import { PolicyQueryService } from '../v1/policy-query/policy-query.service';
import { SsmTargetService } from '../v1/ssm-target/ssm-target.service';
import { KubeService } from '../v1/kube/kube.service';
import { DynamicAccessConfigService } from '../v1/dynamic-access-config/dynamic-access-config.service';

export async function listTargets(
    configService: ConfigService,
    logger: Logger
) : Promise<TargetSummary[]>
{
    const ssmTargetService = new SsmTargetService(configService, logger);
    const kubeService = new KubeService(configService, logger);
    const dynamicConfigService = new DynamicAccessConfigService(configService, logger);

    const [clusters, ssmTargets, dynamicConfigs] = await Promise.all([
        kubeService.ListKubeClusters(),
        ssmTargetService.ListSsmTargets(true),
        dynamicConfigService.ListDynamicAccessConfigs()]
    );

    const clusterTargets = clusters.map<TargetSummary>((cluster) => {
        return {
            type: TargetType.CLUSTER,
            id: cluster.id,
            name: cluster.clusterName,
            status: parseTargetStatus(cluster.status.toString()),
            environmentId: cluster.environmentId,
            targetUsers: cluster.validUsers,
            agentVersion: cluster.agentVersion
        };
    });

    let allTargets = [...ssmTargets.map(ssmTargetToTargetSummary), ...dynamicConfigs.map(dynamicConfigToTargetSummary)];
    const policyQueryService = new PolicyQueryService(configService, logger);

    for (const t of allTargets) {
        const users = (await policyQueryService.ListTargetOSUsers(t.id, t.type, {type: VerbType.Shell}, undefined)).allowedTargetUsers;
        t.targetUsers = users.map(u => u.userName);
    }
    allTargets = allTargets.concat(clusterTargets);

    return allTargets;
}