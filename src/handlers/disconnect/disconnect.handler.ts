import { killDaemon } from '../../utils/daemon-utils';
import yargs from 'yargs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { disconnectArgs } from './disconnect.command-builder';

export async function disconnectHandler(
    argv: yargs.Arguments<disconnectArgs>,
    configService: ConfigService,
    logger: Logger
) {
    const targetType = argv.targetType;

    if (targetType == 'all' || targetType == 'kube') {
        // Ensure nothing is using that localpid
        const kubeConfig = configService.getKubeConfig();

        if (kubeConfig['localPid'] != null) {
            await killDaemon(kubeConfig['localPid'], logger)

            // Update the localPid
            kubeConfig['localPid'] = null;
            configService.setKubeConfig(kubeConfig);
            logger.info('Killed local kube daemon!');
        } else {
            logger.warn('No kube daemon running');
        }
    }
    if (targetType == 'all' || targetType == 'web') {
        // Ensure nothing is using that localpid
        const webConfig = configService.getWebConfig();

        if (webConfig['localPid'] != null) {
            await killDaemon(webConfig['localPid'], logger)

            // Update the localPid
            webConfig['localPid'] = null;
            configService.setWebConfig(webConfig);
            logger.info('Killed local web daemon!');
        } else {
            logger.warn('No web daemon running');
        }
    }
    if (targetType == 'all' || targetType == 'db') {
        // Ensure nothing is using that localpid
        const dbConfig = configService.getDbConfig();

        if (dbConfig['localPid'] != null) {
            await killDaemon(dbConfig['localPid'], logger)

            // Update the localPid
            dbConfig['localPid'] = null;
            configService.setDbConfig(dbConfig);
            logger.info('Killed local db daemon!');
        } else {
            logger.warn('No db daemon running');
        }
    }
    await cleanExit(0, logger);
}