import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary } from '../../utils/utils';
import { TargetSummary, TargetType } from '../common.types';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { VerbType } from '../policy-query/policy-query.types';
import { PolicyQueryService } from '../policy-query/policy-query.service';
import { SsmTargetService } from '../ssm-target/ssm-target.service';
import { KubeService } from '../kube/kube.service';
import { DynamicAccessConfigService } from '../dynamic-access-config/dynamic-access-config.service';
import { BzeroAgentService } from '../bzero-agent/bzero-agent.service';
import { VirtualTargetService } from '../virtual-target/virtual-target.service';

export async function listTargets(
    configService: ConfigService,
    logger: Logger
) : Promise<TargetSummary[]>
{
    const ssmTargetService = new SsmTargetService(configService, logger);
    const kubeService = new KubeService(configService, logger);
    const dynamicConfigService = new DynamicAccessConfigService(configService, logger);
    const bzeroAgentService = new BzeroAgentService(configService, logger);
    const virtualTargetService = new VirtualTargetService(configService, logger);

    const [clusters, ssmTargets, dynamicConfigs, bzeroAgents, webTargetsRaw, dbTargetsRaw] = await Promise.all([
        kubeService.ListKubeClusters(),
        ssmTargetService.ListSsmTargets(true),
        dynamicConfigService.ListDynamicAccessConfigs(),
        bzeroAgentService.ListBzeroAgents(),
        virtualTargetService.ListWebTargets(),
        virtualTargetService.ListDbTargets()
    ]);

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

    const bzeroAgentTargets = bzeroAgents.map<TargetSummary>((bzeroAgent) => {
        return {
            type: TargetType.BZERO_AGENT,
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
            type: TargetType.WEB,
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
            type: TargetType.DB,
            id: dbTarget.id,
            name: dbTarget.targetName,
            status: parseTargetStatus(dbTarget.status.toString()),
            environmentId: 'N/A',
            targetUsers: [],
            agentVersion: dbTarget.agentVersion
        }
    })

    let allTargets = [...ssmTargets.map(ssmTargetToTargetSummary), ...dynamicConfigs.map(dynamicConfigToTargetSummary)];
    const policyQueryService = new PolicyQueryService(configService, logger);

    for (const t of allTargets) {
        const users = (await policyQueryService.ListTargetOSUsers(t.id, t.type, {type: VerbType.Shell}, undefined)).allowedTargetUsers;
        t.targetUsers = users.map(u => u.userName);
    }

    // Concat all the different types of targets we have
    allTargets = allTargets.concat(clusterTargets);
    allTargets = allTargets.concat(bzeroAgentTargets);
    allTargets = allTargets.concat(webTargets);
    allTargets = allTargets.concat(dbTargets);

    return allTargets;
}