import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { PolicyQueryService } from '../../services/v1/policy-query/policy-query.service';
import { ClusterDetails } from '../../services/v1/kube/kube.types';
import { getTableOfDescribeCluster } from '../../utils/utils';
import { KubePolicySummary, KubernetesPolicyContext } from '../../services/v1/policy/policy.types';


export async function describeClusterPolicyHandler(
    clusterName: string,
    configService: ConfigService,
    logger: Logger,
    clusterTargets: Promise<ClusterDetails[]>,
) {
    // First determine if the name passed is valid
    let clusterSummary: ClusterDetails = null;
    for (const cluster of await clusterTargets) {
        if (cluster.name == clusterName) {
            clusterSummary = cluster;
            break;
        }
    }

    if (clusterSummary == null) {
        logger.error(`Unable to find cluster with name: ${clusterName}`);
        await cleanExit(1, logger);
    }

    // Now make a query to see all policies associated with this cluster
    const policyService = new PolicyQueryService(configService, logger);
    const clusterPolicyInfo = await policyService.GetAllPoliciesForClusterId(clusterSummary.id);

    if (clusterPolicyInfo.policies.length === 0){
        logger.info('There are no available policies for this cluster.');
        await cleanExit(0, logger);
    }

    // Now get all the targetUsers for each of those policies
    const kubePolicySummarys: KubePolicySummary[] = [];
    for (const policy of clusterPolicyInfo.policies) {
        const kubeContext: KubernetesPolicyContext = <KubernetesPolicyContext> policy.context;

        // Loop over and format the target groups
        const targetGroupsFormatted: string[] = [];
        Object.values(kubeContext.clusterGroups).forEach(clusterGroup => {
            targetGroupsFormatted.push(clusterGroup.name);
        });

        // Loop over and format the target users
        const targetUsersFormatted: string[] = [];
        Object.values(kubeContext.clusterUsers).forEach(clusterUser => {
            targetUsersFormatted.push(clusterUser.name);
        });

        // Now add to our list
        const kubePolicySummary: KubePolicySummary = {
            policy: policy,
            targetGroups: targetGroupsFormatted,
            targetUsers: targetUsersFormatted
        };
        kubePolicySummarys.push(kubePolicySummary);
    }

    // regular table output
    const tableString = getTableOfDescribeCluster(kubePolicySummarys);
    console.log(tableString);
}