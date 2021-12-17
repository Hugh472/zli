import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary } from '../../utils/utils';
import { TargetSummary } from '../common.types';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { VerbType } from '../v1/policy-query/policy-query.types';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';

export async function listTargets(
    configService: ConfigService,
    logger: Logger
) : Promise<TargetSummary[]>
{
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const kubeHttpService = new KubeHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);

    const [clusters, ssmTargets, dynamicConfigs] = await Promise.all([
        kubeHttpService.ListKubeClusters(),
        ssmTargetHttpService.ListSsmTargets(true),
        dynamicConfigHttpService.ListDynamicAccessConfigs()]
    );

    const clusterTargets = clusters.map<TargetSummary>((cluster) => {
        return {
            type: TargetType.Cluster,
            id: cluster.id,
            name: cluster.clusterName,
            status: parseTargetStatus(cluster.status.toString()),
            environmentId: cluster.environmentId,
            targetUsers: cluster.validUsers,
            agentVersion: cluster.agentVersion
        };
    });

    let allTargets = [...ssmTargets.map(ssmTargetToTargetSummary), ...dynamicConfigs.map(dynamicConfigToTargetSummary)];
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);

    for (const t of allTargets) {
        const users = (await policyQueryHttpService.GetTargetPolicy(t.id, t.type, {type: VerbType.Shell}, undefined)).allowedTargetUsers;
        t.targetUsers = users.map(u => u.userName);
    }
    allTargets = allTargets.concat(clusterTargets);

    return allTargets;
}