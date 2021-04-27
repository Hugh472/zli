import { ConnectionState, SessionDetails } from '../../src/http.service/http.service.types';
import { ConnectionService, SessionService } from '../../src/http.service/http.service';
import { ConfigService } from '../config.service/config.service';
import { Logger } from '../logger.service/logger';
import { SessionState } from '../types';
import { cleanExit } from './clean-exit.handler';


export async function logoutHandler(configService: ConfigService, logger: Logger) {
    // call list session
    const sessionService = new SessionService(configService, logger);
    const listSessions = await sessionService.ListSessions();

    // space names are not unique, make sure to find the latest active one
    const cliSpace = listSessions.sessions.filter(s => s.displayName === 'cli-space' && s.state == SessionState.Active); // TODO: cli-space name can be changed in config

    // maybe make a session
    let cliSession: SessionDetails;
    if(cliSpace.length === 0) {
        //cliSessionId =  await sessionService.CreateSession('cli-space');
    } else {
        // there should only be 1 active 'cli-space' session
        cliSession = cliSpace.pop();
    }
    const connectionService = new ConnectionService(configService, logger);
    logger.debug('Closing any open cli connections');        
    for (let index = 0; index < cliSession.connections.length; index++) {
        logger.debug('Closing connection: ' + cliSession.connections[index].id + " with state: " + cliSession.connections[index].state);
        if(cliSession.connections[index].state == ConnectionState.Open)
            await connectionService.CloseConnection(cliSession.connections[index].id);
    }
    // await cliSession.connections.forEach(async conn => {
    //     await connectionService.CloseConnection(conn.id);
    //     logger.debug('Closed connection: ' + conn.id);        
    // });
    // Deletes the auth tokens from the config which will force the
    // user to login again before running another command
    configService.logout();
    logger.info('Logout successful');
    await cleanExit(0, logger);
}