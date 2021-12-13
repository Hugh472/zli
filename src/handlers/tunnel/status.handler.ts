import got from 'got/dist/source';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfKubeStatus } from '../../../src/utils/utils';
import { killPortProcess } from '../../../src/services/kube/kube.service';
import { StatusResponse } from '../../../src/services/kube/kube.types';

export async function kubeStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const kubeConfig = configService.getKubeConfig();

    if (kubeConfig['localPid'] == null) {
        // Always ensure nothing is using the localport
        await killPortProcess(kubeConfig['localPort']);

        logger.warn('No Kube daemon running');
    } else {
        // Check if the pid is still alive
        if (!require('is-running')(kubeConfig['localPid'])) {
            logger.error('The Kube Daemon has quit unexpectedly.');
            kubeConfig['localPid'] = null;

            // Always ensure nothing is using the localport
            await killPortProcess(kubeConfig['localPort']);

            configService.setKubeConfig(kubeConfig);
            await cleanExit(0, logger);
            return;
        }

        try {
            const statusResponse: StatusResponse = await got.get(`https://localhost:${kubeConfig['localPort']}/bastionzero-status`,  {https: { rejectUnauthorized: false }}).json();
            // Check if there is an exit message to show the user
            if (statusResponse.ExitMessage != '') {
                logger.error(`The Kube Deamon has gotten an exit message from Bastion. Please try logging in again and re-connect with 'zli tunnel'.\nExit Message: ${statusResponse.ExitMessage}`);
            } else {
                // If there is no exist message, pull the info from the config and show it to the user
                logger.info(`Kube Daemon running:`);
                const tableString = getTableOfKubeStatus(kubeConfig);
                console.log(tableString);
            }
        } catch (err){
            logger.error(`Error contacting Kube Daemon. Please try logging in again and restarting the daemon. Error: ${err}`);
        }
    }
    await cleanExit(0, logger);
}