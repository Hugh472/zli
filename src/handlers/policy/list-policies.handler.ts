import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { parsePolicyType } from '../../utils/utils';
import _ from 'lodash';
import { ApiKeyDetails } from '../../services/v1/api-key/api-key.types';
import { TargetSummary } from '../../services/common.types';
import { GroupSummary } from '../../services/v1/groups/groups.types';
import { PolicyService } from '../../services/v1/policy/policy.service';
import { UserSummary } from '../../services/v1/user/user.types';
import yargs from 'yargs';
import { policyArgs } from './policy.command-builder';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { EnvironmentSummary } from '../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';

export async function listPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger,
    ssmTargets: Promise<TargetSummary[]>,
    dynamicAccessConfigs: Promise<TargetSummary[]>,
    clusterTargets: Promise<KubeClusterSummary[]>,
    environments: Promise<EnvironmentSummary[]>
){
    const policyService = new PolicyService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const apiKeyHttpService = new ApiKeyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);

    let policies = await policyService.ListAllPolicies();

    // If provided type filter, apply it
    if(!! argv.type) {
        const policyType = parsePolicyType(argv.type);
        policies = _.filter(policies,p => p.type == policyType);
    }

    // Fetch all the users, apiKeys, environments and targets
    // We will use that info to print the policies in a readable way
    const users = await userHttpService.ListUsers();
    const userMap : { [id: string]: UserSummary } = {};
    users.forEach(userSummary => {
        userMap[userSummary.id] = userSummary;
    });

    const apiKeys = await apiKeyHttpService.ListAllApiKeys();
    const apiKeyMap : { [id: string]: ApiKeyDetails } = {};
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
    (await ssmTargets).forEach(ssmTarget => {
        targetNameMap[ssmTarget.id] = ssmTarget.name;
    });
    (await dynamicAccessConfigs).forEach(dacs => {
        targetNameMap[dacs.id] = dacs.name;
    });
    (await clusterTargets).forEach(clusterTarget => {
        targetNameMap[clusterTarget.id] = clusterTarget.clusterName;
    });

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(policies));
    } else {
        if (policies.length === 0){
            logger.info('There are no available policies');
            await cleanExit(0, logger);
        }
        // regular table output
        // const tableString = getTableOfPolicies(policies, userMap, apiKeyMap, environmentMap, targetNameMap, groupMap);
        // console.log(tableString);
    }

    await cleanExit(0, logger);
}