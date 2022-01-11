import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary } from '../../utils/utils';
import { TargetSummary } from '../common.types';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { BzeroAgentService } from '../bzero-agent/bzero-agent.service';
import { VirtualTargetService } from '../virtual-target/virtual-target.service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';

export async function listTargets(
    configService: ConfigService,
    logger: Logger
) : Promise<TargetSummary[]>
{
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const kubeHttpService = new KubeHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
    const bzeroAgentService = new BzeroAgentService(configService, logger);
    const virtualTargetService = new VirtualTargetService(configService, logger);

    const [clusters, ssmTargets, dynamicConfigs, bzeroAgents, webTargetsRaw, dbTargetsRaw] = await Promise.all([
        kubeHttpService.ListKubeClusters(),
        ssmTargetHttpService.ListSsmTargets(true),
        dynamicConfigHttpService.ListDynamicAccessConfigs(),
        bzeroAgentService.ListBzeroAgents(),
        virtualTargetService.ListWebTargets(),
        virtualTargetService.ListDbTargets()
    ]);

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

    const bzeroAgentTargets = bzeroAgents.map<TargetSummary>((bzeroAgent) => {
        return {
            type: TargetType.Bzero,
            id: bzeroAgent.id,
            name: bzeroAgent.targetName,
            status: parseTargetStatus(bzeroAgent.status.toString()),
            environmentId: bzeroAgent.environmentId,
            targetUsers: [],
            agentVersion: bzeroAgent.agentVersion
        }
    })

    const webTargets = webTargetsRaw.map<TargetSummary>((webTargets) => {
        return {
            type: TargetType.Web,
            id: webTargets.id,
            name: webTargets.targetName,
            status: parseTargetStatus(webTargets.status.toString()),
            environmentId: 'N/A',
            targetUsers: [],
            agentVersion: webTargets.agentVersion
        }
    })

    const dbTargets = dbTargetsRaw.map<TargetSummary>((dbTarget) => {
        return {
            type: TargetType.Db,
            id: dbTarget.id,
            name: dbTarget.targetName,
            status: parseTargetStatus(dbTarget.status.toString()),
            environmentId: 'N/A',
            targetUsers: [],
            agentVersion: dbTarget.agentVersion
        }
    })

    let allTargets = [...ssmTargets.map(ssmTargetToTargetSummary), ...dynamicConfigs.map(dynamicConfigToTargetSummary)];
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);

    for (const t of allTargets) {
        const users = (await policyQueryHttpService.GetTargetPolicy(t.id, t.type, {type: VerbType.Shell}, undefined)).allowedTargetUsers;
        t.targetUsers = users.map(u => u.userName);
    }

    // Concat all the different types of targets we have
    allTargets = allTargets.concat(clusterTargets);
    allTargets = allTargets.concat(bzeroAgentTargets);
    allTargets = allTargets.concat(webTargets);
    allTargets = allTargets.concat(dbTargets);

    return allTargets;
}