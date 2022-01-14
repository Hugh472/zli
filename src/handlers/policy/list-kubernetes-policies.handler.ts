import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import yargs from 'yargs';
import { policyArgs } from './policy.command-builder';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { EnvironmentSummary } from '../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { PolicyHttpService } from '../../http-services/policy/policy.http-services';
import { getTableOfKubernetesPolicies } from '../../utils/utils';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { ApiKeySummary } from '../../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { GroupSummary } from '../../../webshell-common-ts/http/v2/organization/types/group-summary.types';

export async function listKubernetesPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger,
    clusterTargets: Promise<KubeClusterSummary[]>,
    environments: Promise<EnvironmentSummary[]>
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const apiKeyHttpService = new ApiKeyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);

    const kubernetesPolicies = await policyHttpService.ListKubernetesPolicies();

    // Fetch all the users, apiKeys, environments and targets
    // We will use that info to print the policies in a readable way
    const users = await userHttpService.ListUsers();
    const userMap : { [id: string]: UserSummary } = {};
    users.forEach(userSummary => {
        userMap[userSummary.id] = userSummary;
    });

    const apiKeys = await apiKeyHttpService.ListAllApiKeys();
    const apiKeyMap : { [id: string]: ApiKeySummary } = {};
    apiKeys.forEach(apiKeyDetails => {
        apiKeyMap[apiKeyDetails.id] = apiKeyDetails;
    });

    const groupMap : { [id: string]: GroupSummary } = {};
    const groups = await organizationHttpService.ListGroups();
    if (!!groups)
        groups.forEach(groupSummary => {
            groupMap[groupSummary.idPGroupId] = groupSummary;
        });

    const environmentMap : { [id: string]: EnvironmentSummary } = {};
    (await environments).forEach(environmentSummaries => {
        environmentMap[environmentSummaries.id] = environmentSummaries;
    });

    const targetNameMap : { [id: string]: string } = {};
    (await clusterTargets).forEach(clusterTarget => {
        targetNameMap[clusterTarget.id] = clusterTarget.clusterName;
    });

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(kubernetesPolicies));
    } else {
        if (kubernetesPolicies.length === 0){
            logger.info('There are no available Kubernetes policies');
        } else {
            // regular table output
            const tableString = getTableOfKubernetesPolicies(kubernetesPolicies, userMap, apiKeyMap, environmentMap, targetNameMap, groupMap);
            logger.warn('Kubernetes Policies:\n');
            console.log(tableString);
            console.log('\n\n');
        }
    }
}