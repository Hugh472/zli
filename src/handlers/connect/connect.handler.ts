import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';

import { connectCheckAllowedTargetUsers, targetStringExample } from '../../utils/utils';
import { createAndRunShell, getCliSpace, pushToStdOut } from '../../utils/shell-utils';
import { ParsedTargetString } from '../../services/common.types';
import { MixpanelService } from '../../services/mixpanel/mixpanel.service';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { DynamicAccessConfigHttpService } from '../../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';


export async function connectHandler(
    configService: ConfigService,
    logger: Logger,
    mixpanelService: MixpanelService,
    parsedTarget: ParsedTargetString
) {
    if(! parsedTarget) {
        logger.error('No targets matched your targetName/targetId or invalid target string, must follow syntax:');
        logger.error(targetStringExample);
        await cleanExit(1, logger);
    }

    // If the user is an admin make sure they have a policy that allows access
    // to the target. If they are a non-admin then they must have a policy that
    // allows access to even be able to list and parse the target
    const me = configService.me();
    if(me.isAdmin) {
        const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
        const response = await policyQueryHttpService.TargetConnectPolicyQuery([parsedTarget.id], parsedTarget.type, me.email);
        if (response[parsedTarget.id].allowed != true) {
            logger.error(`You do not have a TargetAccess policy setup to access ${parsedTarget.name}`);
            await cleanExit(1, logger);
        }
    }

    // Check targetUser/Verb
    let allowedTargetUsers: string[] = [];
    let allowedVerbs: string[] = [];
    if(parsedTarget.type == TargetType.SsmTarget) {
        const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
        const ssmTarget = await ssmTargetHttpService.GetSsmTarget(parsedTarget.id);
        allowedTargetUsers = ssmTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = ssmTarget.allowedVerbs.map(v => v.type);
    } else if(parsedTarget.type == TargetType.DynamicAccessConfig) {
        const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
        const dynamicAccessTarget = await dynamicConfigHttpService.GetDynamicAccessConfig(parsedTarget.id);
        allowedTargetUsers = dynamicAccessTarget.allowedTargetUsers.map(u => u.userName);
        allowedVerbs = dynamicAccessTarget.allowedVerbs.map(v => v.type);
    }

    if(! allowedVerbs.includes(VerbType.Shell)) {
        logger.error(`You do not have a TargetAccess policy that allows Shell access to target ${parsedTarget.name}`);
        await cleanExit(1, logger);
    }

    const targetUser = await connectCheckAllowedTargetUsers(parsedTarget.name, parsedTarget.user, allowedTargetUsers, logger);

    // Get the existing if any or create a new cli space id
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);
    let cliSpaceId: string;
    if (cliSpace === undefined)
    {
        cliSpaceId = await spaceHttpService.CreateSpace('cli-space');
    } else {
        cliSpaceId = cliSpace.id;
    }

    // make a new connection
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    // if SSM user does not exist then resp.connectionId will throw a
    // 'TypeError: Cannot read property 'connectionId' of undefined'
    // so we need to catch and return undefined
    const connectionId = await connectionHttpService.CreateConnection(parsedTarget.type, parsedTarget.id, cliSpaceId, targetUser).catch(() => undefined);

    if(! connectionId)
    {
        logger.error('Connection creation failed');

        logger.error(`You may not have a policy for targetUser ${parsedTarget.user} in environment ${parsedTarget.envName}`);
        logger.info('You can find SSM user policies in the web app');

        await cleanExit(1, logger);
    }

    // Note: For DATs the actual target to connect to will be a dynamically
    // created ssm target that is provisioned by the DynamicAccessTarget and not
    // the id of the dynamic access target. The dynamically created ssm target should be
    // returned in the connectionSummary.targetId for this newly created
    // connection

    const connectionSummary = await connectionHttpService.GetConnection(connectionId);

    const runShellPromise = createAndRunShell(configService, logger, connectionSummary, pushToStdOut);
    mixpanelService.TrackNewConnection(parsedTarget.type);

    return await runShellPromise;
}
