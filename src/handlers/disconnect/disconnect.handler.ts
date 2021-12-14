import { ConfigService } from '../../services/config/config.service';
import { killDaemon } from '../../services/v1/kube/kube.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';

export async function disconnectHandler(
    configService: ConfigService,
    logger: Logger
) {
    if (await killDaemon(configService, logger)) {
        logger.info('Killed local Kube daemon');
    } else {
        logger.warn('No Kube daemon running');
    }
    await cleanExit(0, logger);
}