import got from 'got/dist/source';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfDbStatus, getTableOfKubeStatus, getTableOfWebStatus } from '../../utils/utils';
import { statusArgs } from './status.command-builder';
import yargs from 'yargs';
import { killPortProcess } from '../../utils/daemon-utils';

export async function statusHandler(
    argv: yargs.Arguments<statusArgs>,
    configService: ConfigService,
    logger: Logger
) {
    const targetType = argv.targetType;
    if (targetType == 'all' || targetType == 'kube') {
        await kubeStatusHandler(configService, logger);
    }
    if (targetType == 'all' || targetType == 'web') {
        await webStatusHandler(configService, logger);
    }
    if (targetType == 'all' || targetType == 'db') {
        await dbStatusHandler(configService, logger);
    }

    await cleanExit(0, logger);
}

async function webStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const webConfig = configService.getWebConfig();

    if (webConfig['localPid'] == null) {
        // Always ensure nothing is using the localport
        await killPortProcess(webConfig['localPort']);

        logger.warn('No web daemon running');
    } else {
        // Check if the pid is still alive
        if (!require('is-running')(webConfig['localPid'])) {
            logger.error('The web daemon has quit unexpectedly.');
            webConfig['localPid'] = null;

            // Always ensure nothing is using the localport
            await killPortProcess(webConfig['localPort']);

            configService.setWebConfig(webConfig);
            return;
        }

        logger.info(`Web Daemon running:`);
        const tableString = getTableOfWebStatus(webConfig);
        console.log(tableString);
    }
}

async function dbStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const dbConfig = configService.getDbConfig();

    if (dbConfig['localPid'] == null) {
        // Always ensure nothing is using the localport
        await killPortProcess(dbConfig['localPort']);

        logger.warn('No db daemon running');
    } else {
        // Check if the pid is still alive
        if (!require('is-running')(dbConfig['localPid'])) {
            logger.error('The db daemon has quit unexpectedly.');
            dbConfig['localPid'] = null;

            // Always ensure nothing is using the localport
            await killPortProcess(dbConfig['localPort']);

            configService.setDbConfig(dbConfig);
            return;
        }

        logger.info(`Db Daemon running:`);
        const tableString = getTableOfDbStatus(dbConfig);
        console.log(tableString);
    }
}

async function kubeStatusHandler(
    configService: ConfigService,
    logger: Logger
) {
    // First get the status from the config service
    const kubeConfig = configService.getKubeConfig();

    if (kubeConfig['localPid'] == null) {
        // Always ensure nothing is using the localport
        await killPortProcess(kubeConfig['localPort']);

        logger.warn('No kube daemon running');
    } else {
        // Check if the pid is still alive
        if (!require('is-running')(kubeConfig['localPid'])) {
            logger.error('The kube daemon has quit unexpectedly.');
            kubeConfig['localPid'] = null;

            // Always ensure nothing is using the localport
            await killPortProcess(kubeConfig['localPort']);

            configService.setKubeConfig(kubeConfig);
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
}

interface StatusResponse {
    ExitMessage: string;
}