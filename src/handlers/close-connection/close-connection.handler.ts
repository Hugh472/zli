import { getCliSpace } from '../../utils/ssm-shell-utils';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { ConnectionHttpService } from '../../http-services/connection/connection.http-services';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { ConnectionState } from '../../../webshell-common-ts/http/v2/connection/types/connection-state.types';

export async function closeConnectionHandler(
    configService: ConfigService,
    logger: Logger,
    connectionId: string,
    closeAll: boolean
){
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);
    if(! cliSpace){
        logger.error(`There is no cli session. Try creating a new connection to a target using the zli`);
        await cleanExit(1, logger);
    }
    const connectionHttpService = new ConnectionHttpService(configService, logger);

    if(closeAll)
    {
        logger.info('Closing all connections open in cli-space');
        await spaceHttpService.CloseSpace(cliSpace.id);
        await spaceHttpService.CreateSpace('cli-space');
    } else {
        const conn = await connectionHttpService.GetConnection(connectionId);
        // if the connection does belong to the cli space
        if (conn.spaceId !== cliSpace.id){
            logger.error(`Connection ${connectionId} does not belong to the cli space`);
            await cleanExit(1, logger);
        }
        // if connection not already closed
        if(conn.state == ConnectionState.Open){
            await connectionHttpService.CloseConnection(connectionId);
            logger.info(`Connection ${connectionId} successfully closed`);
        }else{
            logger.error(`Connection ${connectionId} is not open`);
            await cleanExit(1, logger);
        }
    }

    await cleanExit(0, logger);
}