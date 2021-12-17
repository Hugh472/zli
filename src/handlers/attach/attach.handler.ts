import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { createAndRunShell, getCliSpace, pushToStdOut } from '../../utils/shell-utils';
import { ConnectionState } from '../../services/v1/connection/connection.types';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';

export async function attachHandler(
    configService: ConfigService,
    logger: Logger,
    connectionId: string
){
    const connectionHttpService = new ConnectionHttpService(configService, logger);
    const connectionSummary = await connectionHttpService.GetConnection(connectionId);

    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);

    if ( ! cliSpace){
        logger.error(`There is no cli session. Try creating a new connection to a target using the zli`);
        await cleanExit(1, logger);
    }
    if (connectionSummary.spaceId !== cliSpace.id){
        logger.error(`Connection ${connectionId} does not belong to the cli space`);
        await cleanExit(1, logger);
    }
    if (connectionSummary.state !== ConnectionState.Open){
        logger.error(`Connection ${connectionId} is not open`);
        await cleanExit(1, logger);
    }
    return await createAndRunShell(configService, logger, connectionSummary, pushToStdOut);
}