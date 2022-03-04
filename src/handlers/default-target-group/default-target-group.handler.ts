import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { defaultTargetGroupArgs } from './default-target-group.command-builder';
import { cleanExit } from '../clean-exit.handler';

export async function defaultTargetGroupHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<defaultTargetGroupArgs>) {
    // Open up our zli kube config
    const kubeConfig = configService.getKubeConfig();

    // If the user passed the --set arg
    // Yargs does not have an easy way to see if the default value was used: https://github.com/yargs/yargs/issues/513
    if (process.argv.includes('--set')) {
        kubeConfig['defaultTargetGroups'] = argv.set;

        configService.setKubeConfig(kubeConfig);

        if (argv.set.length == 0) {
            logger.info('Reset default groups to empty');
        } else {
            logger.info(`Updated default groups to: ${argv.set.join(', ')}`);
        }
    } else {
        const currentDefaultGroups = kubeConfig['defaultTargetGroups'];
        logger.info(`Current default group is set to: ${currentDefaultGroups}`);
    }

    await cleanExit(0, logger);
}