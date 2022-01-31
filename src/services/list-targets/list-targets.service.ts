import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary } from '../../utils/utils';
import { TargetSummary } from '../common.types';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { BzeroAgentService } from '../bzero-agent/bzero-agent.service';
import { WebTargetService } from '../web-target/web-target.service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';
import { DbTargetService } from '../db-target/db-target.service';

export async function listTargets(
    configService: ConfigService,
    logger: Logger
) : Promise<TargetSummary[]>
{
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const kubeHttpService = new KubeHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
    const bzeroAgentService = new BzeroAgentService(configService, logger);
    const webTargetService = new WebTargetService(configService, logger);
    const dbTargetService = new DbTargetService(configService, logger);

    const [clusters, ssmTargets, dynamicConfigs, bzeroAgents, webTargetsRaw, dbTargetsRaw] = await Promise.all([
        kubeHttpService.ListKubeClusters(),
        ssmTargetHttpService.ListSsmTargets(true),
        dynamicConfigHttpService.ListDynamicAccessConfigs(),
        bzeroAgentService.ListBzeroAgents(),
        webTargetService.ListWebTargets(),
        dbTargetService.ListDbTargets()
    ]);

    const clusterTargets = clusters.map<TargetSummary>((cluster) => {
        return {
            type: TargetType.Cluster,
            id: cluster.id,
            name: cluster.name,
            status: parseTargetStatus(cluster.status.toString()),
            environmentId: cluster.environmentId,
            targetUsers: cluster.validUsers,
            agentVersion: cluster.agentVersion,
            region: cluster.region
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
            agentVersion: bzeroAgent.agentVersion,
            region: bzeroAgent.region
        };
    });

    const webTargets = webTargetsRaw.map<TargetSummary>((webTarget) => {
        return {
            type: TargetType.Web,
            id: webTarget.id,
            name: webTarget.name,
            status: parseTargetStatus(webTarget.status.toString()),
            environmentId: webTarget.environmentId,
            targetUsers: [],
            agentVersion: webTarget.agentVersion,
            region: webTarget.region
        };
    });

    const dbTargets = dbTargetsRaw.map<TargetSummary>((dbTarget) => {
        return {
            type: TargetType.Db,
            id: dbTarget.id,
            name: dbTarget.name,
            status: parseTargetStatus(dbTarget.status.toString()),
            environmentId: dbTarget.environmentId,
            targetUsers: [],
            agentVersion: dbTarget.agentVersion,
            region: dbTarget.region
        };
    });

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