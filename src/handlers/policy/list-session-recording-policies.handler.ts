import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { ApiKeyDetails } from '../../services/v1/api-key/api-key.types';
import { TargetSummary } from '../../services/common.types';
import yargs from 'yargs';
import { policyArgs } from './policy.command-builder';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { OrganizationHttpService } from '../../http-services/organization/organization.http-services';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { EnvironmentSummary } from '../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';
import { getTableOfSessionRecordingPolicies } from '../../../src/utils/utils';
import { ApiKeySummary } from '../../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { GroupSummary } from '../../../webshell-common-ts/http/v2/organization/types/group-summary.types';

export async function listSessionRecordingPoliciesHandler(
    argv: yargs.Arguments<policyArgs>,
    configService: ConfigService,
    logger: Logger
){
    const policyHttpService = new PolicyHttpService(configService, logger);
    const userHttpService = new UserHttpService(configService, logger);
    const apiKeyHttpService = new ApiKeyHttpService(configService, logger);
    const organizationHttpService = new OrganizationHttpService(configService, logger);

    const sessionRecordingPolicies = await policyHttpService.ListSessionRecordingPolicies();

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

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(sessionRecordingPolicies));
    } else {
        if (sessionRecordingPolicies.length === 0){
            logger.info('There are no available Session Recording policies');
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfSessionRecordingPolicies(sessionRecordingPolicies, userMap, apiKeyMap, groupMap);
        console.log(tableString);
    }
}