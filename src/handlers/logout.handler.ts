import { ConnectionState, SessionDetails } from '../../src/http.service/http.service.types';
import { ConnectionService, SessionService } from '../../src/http.service/http.service';
import { ConfigService } from '../config.service/config.service';
import { Logger } from '../logger.service/logger';
import { SessionState } from '../types';
import { cleanExit } from './clean-exit.handler';
import _ from 'lodash';


export async function logoutHandler(configService: ConfigService, logger: Logger) {
    // call list session
    const sessionService = new SessionService(configService, logger);
    const listSessions = await sessionService.ListSessions();

    // space names are not unique, make sure to find the latest active one
    const cliSpace = listSessions.sessions.filter(s => s.displayName === 'cli-space' && s.state == SessionState.Active); // TODO: cli-space name can be changed in config

    // maybe make a session
    let cliSession: SessionDetails;
    // If there is no session there are no connections to close, we can exit
    if(cliSpace.length === 0) {
        configService.logout();
        logger.info('Logout successful');
        await cleanExit(0, logger);
        return;
    } else {
        // there should only be 1 active 'cli-space' session
        cliSession = cliSpace.pop();
    }
    const connectionService = new ConnectionService(configService, logger);
    logger.debug('Closing any open cli connections');
    const openConnections = _.filter(cliSession.connections, c => c.state === ConnectionState.Open)
    _.forEach(openConnections, async c => await connectionService.CloseConnection(c.id));

    // Deletes the auth tokens from the config which will force the
    // user to login again before running another command
    configService.logout();
    logger.info('Logout successful');
    await cleanExit(0, logger);
}