import { dynamicConfigToTargetSummary, parseTargetStatus, ssmTargetToTargetSummary } from '../../utils/utils';
import { TargetSummary } from '../../../webshell-common-ts/http/v2/target/targetSummary.types';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { BzeroAgentService } from '../../http-services/bzero-agent/bzero-agent.http-service';
import { WebTargetService } from '../../http-services/web-target/web-target.http-service';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { KubeHttpService } from '../../http-services/targets/kube/kube.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { DbTargetService } from '../../http-services/db-target/db-target.http-service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';

export async function listTargets(
    configService: ConfigService,
    logger: Logger,
    targetTypes: TargetType[],
    userEmail?: string
) : Promise<TargetSummary[]>
{
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    let targetSummaryWork: Promise<TargetSummary[]>[] = [];

    if (targetTypes.includes(TargetType.SsmTarget)) {
        const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
        const getSsmTargetSummaries = async () => {
            let ssmTargetSummaries = await ssmTargetHttpService.ListSsmTargets(true);

            if(userEmail) {
                // Filter ssm targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.TargetConnectPolicyQuery(ssmTargetSummaries.map(t => t.id), TargetType.SsmTarget, userEmail);
                ssmTargetSummaries = ssmTargetSummaries.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed target users/verbs
                ssmTargetSummaries.forEach(t => {
                    t.allowedTargetUsers = policyQueryResponse[t.id].allowedTargetUsers;
                    t.allowedVerbs = policyQueryResponse[t.id].allowedVerbs;
                });
            }

            return ssmTargetSummaries.map(ssmTargetToTargetSummary);
        };

        targetSummaryWork = targetSummaryWork.concat(getSsmTargetSummaries());
    }

    if (targetTypes.includes(TargetType.DynamicAccessConfig)) {
        const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
        const getDynamicAccessConfigSummaries = async () => {
            let dynamicAccessConfigSummaries = await dynamicConfigHttpService.ListDynamicAccessConfigs();
            if (userEmail) {
                // Filter dac targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.TargetConnectPolicyQuery(dynamicAccessConfigSummaries.map(t => t.id), TargetType.DynamicAccessConfig, userEmail);
                dynamicAccessConfigSummaries = dynamicAccessConfigSummaries.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed target users/verbs
                dynamicAccessConfigSummaries.forEach(t => {
                    t.allowedTargetUsers = policyQueryResponse[t.id].allowedTargetUsers;
                    t.allowedVerbs = policyQueryResponse[t.id].allowedVerbs;
                });
            }

            return dynamicAccessConfigSummaries.map(dynamicConfigToTargetSummary);
        };

        targetSummaryWork = targetSummaryWork.concat(getDynamicAccessConfigSummaries());
    }

    if (targetTypes.includes(TargetType.Bzero)) {
        const bzeroAgentService = new BzeroAgentService(configService, logger);
        const getBzeroAgentTargetSummaries = async () => {
            let bzeroAgents = await bzeroAgentService.ListBzeroAgents();
            if (userEmail) {
                // Filter bzero targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.TargetConnectPolicyQuery(bzeroAgents.map(t => t.id), TargetType.Bzero, userEmail);
                bzeroAgents = bzeroAgents.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed target users/verbs
                bzeroAgents.forEach(t => {
                    t.allowedTargetUsers = policyQueryResponse[t.id].allowedTargetUsers;
                    t.allowedVerbs = policyQueryResponse[t.id].allowedVerbs;
                });
            }

            return bzeroAgents.map<TargetSummary>((bzeroAgent) => {
                return {
                    type: TargetType.Bzero,
                    agentPublicKey: bzeroAgent.agentPublicKey,
                    id: bzeroAgent.id,
                    name: bzeroAgent.name,
                    status: parseTargetStatus(bzeroAgent.status.toString()),
                    environmentId: bzeroAgent.environmentId,
                    targetUsers: bzeroAgent.allowedTargetUsers.map(u => u.userName),
                    agentVersion: bzeroAgent.agentVersion,
                    region: bzeroAgent.region
                };
            });
        };

        targetSummaryWork = targetSummaryWork.concat(getBzeroAgentTargetSummaries());
    }

    if (targetTypes.includes(TargetType.Cluster)) {
        const kubeHttpService = new KubeHttpService(configService, logger);
        const getKubeClusterSummaries = async () => {
            let kubeClusterSummaries = await kubeHttpService.ListKubeClusters();
            if (userEmail) {
                // Filter cluster targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.KubePolicyQuery(kubeClusterSummaries.map(t => t.id), userEmail);
                kubeClusterSummaries = kubeClusterSummaries.filter(t => policyQueryResponse[t.id].allowed);

                // Update set of allowed cluster users/groups
                kubeClusterSummaries.forEach(cluster => {
                    cluster.allowedClusterUsers = policyQueryResponse[cluster.id].allowedClusterUsers;
                    cluster.allowedClusterGroups = policyQueryResponse[cluster.id].allowedClusterGroups;
                });
            }

            return kubeClusterSummaries.map<TargetSummary>((cluster) => {
                return {
                    type: TargetType.Cluster,
                    agentPublicKey: cluster.agentPublicKey,
                    id: cluster.id,
                    name: cluster.name,
                    status: parseTargetStatus(cluster.status.toString()),
                    environmentId: cluster.environmentId,
                    targetUsers: cluster.allowedClusterUsers,
                    agentVersion: cluster.agentVersion,
                    region: cluster.region
                };
            });
        };

        targetSummaryWork = targetSummaryWork.concat(getKubeClusterSummaries());
    }

    if (targetTypes.includes(TargetType.Db)) {
        const dbTargetService = new DbTargetService(configService, logger);
        const getDbTargetSummaries = async () => {
            let dbTargetSummaries = await dbTargetService.ListDbTargets();
            if (userEmail) {
                // Filter db targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.ProxyPolicyQuery(dbTargetSummaries.map(t => t.id), TargetType.Db, userEmail);
                dbTargetSummaries = dbTargetSummaries.filter(t => policyQueryResponse[t.id].allowed);
            }

            return dbTargetSummaries.map<TargetSummary>((dbTarget) => {
                return {
                    type: TargetType.Db,
                    agentPublicKey: dbTarget.agentPublicKey,
                    id: dbTarget.id,
                    name: dbTarget.name,
                    status: parseTargetStatus(dbTarget.status.toString()),
                    environmentId: dbTarget.environmentId,
                    targetUsers: [],
                    agentVersion: dbTarget.agentVersion,
                    region: dbTarget.region
                };
            });
        };

        targetSummaryWork = targetSummaryWork.concat(getDbTargetSummaries());
    }

    if (targetTypes.includes(TargetType.Web)) {
        const webTargetService = new WebTargetService(configService, logger);
        const getWebTargetSummaries = async () => {
            let webTargetSummaries = await webTargetService.ListWebTargets();
            if (userEmail) {
                // Filter web targets based on assumed user policy
                const policyQueryResponse = await policyQueryHttpService.ProxyPolicyQuery(webTargetSummaries.map(t => t.id), TargetType.Web, userEmail);
                webTargetSummaries = webTargetSummaries.filter(t => policyQueryResponse[t.id].allowed);
            }

            return webTargetSummaries.map<TargetSummary>((webTarget) => {
                return {
                    type: TargetType.Web,
                    agentPublicKey: webTarget.agentPublicKey,
                    id: webTarget.id,
                    name: webTarget.name,
                    status: parseTargetStatus(webTarget.status.toString()),
                    environmentId: webTarget.environmentId,
                    targetUsers: [],
                    agentVersion: webTarget.agentVersion,
                    region: webTarget.region
                };
            });
        };

        targetSummaryWork = targetSummaryWork.concat(getWebTargetSummaries());
    }

    const allTargetSummaries = await Promise.all(targetSummaryWork);
    const allTargetSummariesFlattened = allTargetSummaries.reduce((t1, t2) => t1.concat(t2));

    return allTargetSummariesFlattened;
}