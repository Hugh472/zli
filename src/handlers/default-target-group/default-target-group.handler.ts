import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { defaultTargetGroupArgs } from './default-target-group.command-builder';

export async function defaultTargetGroupHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<defaultTargetGroupArgs>) {

    // Open up our zli kube config
    const kubeConfig = configService.getKubeConfig();

    if (argv.view) {
        const currentDefaultGroups = kubeConfig['defaultTargetGroups'];
        logger.info(`Current default group is set to: ${currentDefaultGroups}`);
    } else {
        kubeConfig['defaultTargetGroups'] = argv.groups;

        configService.setKubeConfig(kubeConfig);

        logger.info(`Updated default groups to: ${argv.groups.join(', ')}`);
    }
    ;
}