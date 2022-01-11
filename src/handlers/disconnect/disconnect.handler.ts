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
        await killDaemon(kubeConfig['localPid'], logger)

        // Update the localPid
        kubeConfig['localPid'] = null;
        configService.setKubeConfig(kubeConfig);
    }
    if (targetType == 'all' || targetType == 'web') {
        // Ensure nothing is using that localpid
        const webConfig = configService.getWebConfig();
        await killDaemon(webConfig['localPid'], logger)

        // Update the localPid
        webConfig['localPid'] = null;
        configService.setWebConfig(webConfig);
    }
    if (targetType == 'all' || targetType == 'db') {
        // Ensure nothing is using that localpid
        const dbConfig = configService.getDbConfig();
        await killDaemon(dbConfig['localPid'], logger)

        // Update the localPid
        dbConfig['localPid'] = null;
        configService.setDbConfig(dbConfig);
    }
    await cleanExit(0, logger);
}