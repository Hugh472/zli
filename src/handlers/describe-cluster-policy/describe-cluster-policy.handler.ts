import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfDescribeCluster } from '../../utils/utils';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';
import { PolicyHttpService } from '../../http-services/policy/policy.http-services';


export async function describeClusterPolicyHandler(
    clusterName: string,
    configService: ConfigService,
    logger: Logger,
    clusterTargets: Promise<KubeClusterSummary[]>,
) {
    // First determine if the name passed is valid
    let clusterSummary: KubeClusterSummary = null;
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
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const kubernetesPolicyQueryResponse = await policyQueryHttpService.KubePolicyQuery([clusterSummary.id]);
    const kubePolicies = kubernetesPolicyQueryResponse[clusterSummary.id].allowedPolicies;

    if (kubePolicies.length === 0){
        logger.info('There are no available policies for this cluster.');
        await cleanExit(0, logger);
    }

    const policyHttpService = new PolicyHttpService(configService, logger);
    const allKubePolicies = await policyHttpService.ListKubernetesPolicies();
    const filteredKubePolicies = allKubePolicies.filter(p => kubePolicies.includes(p.id));

    // regular table output
    const tableString = getTableOfDescribeCluster(filteredKubePolicies);
    console.log(tableString);
}