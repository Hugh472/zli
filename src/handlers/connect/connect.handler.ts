import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';

import { targetStringExample } from '../../utils/utils';
import { createAndRunShell, getCliSpace, pushToStdOut } from '../../utils/shell-utils';
import { includes } from 'lodash';
import { ParsedTargetString } from '../../services/common.types';
import { GAService } from '../../services/mixpanel/mixpanel.service';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';
import { VerbType } from '../../../webshell-common-ts/http/v2/policy/types/verb-type.types';


export async function connectHandler(
    configService: ConfigService,
    logger: Logger,
    mixpanelService: GAService,
    parsedTarget: ParsedTargetString
) {
    if(! parsedTarget) {
        logger.error('No targets matched your targetName/targetId or invalid target string, must follow syntax:');
        logger.error(targetStringExample);
        await cleanExit(1, logger);
    }

    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const response = await policyQueryHttpService.GetTargetPolicy(parsedTarget.id, parsedTarget.type, {type: VerbType.Shell}, undefined);

    if(! response.allowed)
    {
        logger.error('You do not have sufficient permission to access the target');
        await cleanExit(1, logger);
    }

    const allowedTargetUsers = response.allowedTargetUsers.map(u => u.userName);
    if(response.allowedTargetUsers && ! includes(allowedTargetUsers, parsedTarget.user)) {
        logger.error(`You do not have permission to connect as targetUser: ${parsedTarget.user}`);
        logger.info(`Current allowed users for you: ${allowedTargetUsers}`);
        await cleanExit(1, logger);
    }

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

    const targetUser = parsedTarget.user;

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

