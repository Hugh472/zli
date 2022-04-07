import { killDaemon } from '../utils/daemon-utils';
import { ConfigService } from '../services/config/config.service';
import { Logger } from '../services/logger/logger.service';
import { cleanExit } from './clean-exit.handler';


export async function logoutHandler(configService: ConfigService, logger: Logger) {
    // Deletes the auth tokens from the config which will force the
    // user to login again before running another command
    configService.logout();
    configService.deleteSessionId();
    logger.info('Closing any existing SSH Tunnel Connections');

    // Close any daemon connections, start with kube
    logger.info('Closing any existing Kube Connections');
    const kubeConfig = configService.getKubeConfig();
    killDaemon(kubeConfig['localPid'], kubeConfig['localPort'], logger);

    // Update the localPid
    kubeConfig['localPid'] = null;
    configService.setKubeConfig(kubeConfig);

    // Then db
    logger.info('Closing any existing Db Connections');
    const dbConfig = configService.getDbConfig();
    killDaemon(dbConfig['localPid'], dbConfig['localPort'], logger);

    // Update the localPid
    dbConfig['localPid'] = null;
    configService.setDbConfig(dbConfig);

    // Then web
    logger.info('Closing any existing Web Connections');
    const webConfig = configService.getWebConfig();
    killDaemon(webConfig['localPid'],  webConfig['localPort'], logger);

    // Update the localPid
    webConfig['localPid'] = null;
    configService.setWebConfig(webConfig);

    logger.info('Logout successful');
    await cleanExit(0, logger);
}