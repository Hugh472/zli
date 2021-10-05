import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfKubeStatus } from '../../../src/utils';

export async function kubeStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const kubeConfig = configService.getKubeConfig();

    if (kubeConfig['localPid'] == null) {
        logger.warn('No Kube daemon running');
    } else {
        // Check if the pid is still alive
        if (!require('is-running')(kubeConfig['localPid'])) {
            logger.error('The Kube Daemon has quit unexpectedly.');
            kubeConfig['localPid'] = null;
            configService.setKubeConfig(kubeConfig);
            await cleanExit(0, logger);
            return;
        }

        // Pull the info from the config and show it to the user
        logger.info(`Kube Daemon running:`);
        const tableString = getTableOfKubeStatus(kubeConfig);
        console.log(tableString);
    }
    await cleanExit(0, logger);
}