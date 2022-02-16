import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfDescribeCluster } from '../../utils/utils';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';


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
    const kubernetesPolicies = (await policyQueryHttpService.GetKubePolicies(clusterSummary.id)).kubernetesPolicies;

    if (kubernetesPolicies.length === 0){
        logger.info('There are no available policies for this cluster.');
        await cleanExit(0, logger);
    }

    // regular table output
    const tableString = getTableOfDescribeCluster(kubernetesPolicies);
    console.log(tableString);
}