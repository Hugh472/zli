import util from 'util';
import fs from 'fs';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { getAutodiscoveryScript } from '../..//http-services/auto-discovery-script/auto-discovery-script.http-services';
import yargs from 'yargs';
import { generateBashArgs } from './generate-bash.command-builder';
import { TargetName } from '../../../webshell-common-ts/autodiscovery-script/autodiscovery-script.types';
import { getEnvironmentFromName } from '../../../src/utils/utils';
import { EnvironmentSummary } from '../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { ScriptTargetNameOption } from '../../../webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';

export async function generateBashHandler(
    argv: yargs.Arguments<generateBashArgs>,
    logger: Logger,
    configService: ConfigService,
    environments: Promise<EnvironmentSummary[]>
) {
    let scriptTargetNameOption: ScriptTargetNameOption;

    switch (argv.targetNameScheme) {
        case 'do':
            scriptTargetNameOption = ScriptTargetNameOption.DigitalOceanMetadata;
            break;
        case 'aws':
            scriptTargetNameOption = ScriptTargetNameOption.AwsEc2Metadata;
            break;
        case 'time':
            scriptTargetNameOption = ScriptTargetNameOption.Timestamp;
            break;
        case 'hostname':
            scriptTargetNameOption = ScriptTargetNameOption.BashHostName;
            break;
        default:
            // Compile-time exhaustive check
            // See: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
            const _exhaustiveCheck: never = argv.targetNameScheme;
            return _exhaustiveCheck;
    }

    // Ensure that environment name argument is valid
    const envs = await environments;
    const environment = await getEnvironmentFromName(argv.environment, envs, logger);

    const script = await getAutodiscoveryScript(logger, configService, environment.id, scriptTargetNameOption, argv.agentVersion);

    if (argv.outputFile) {
        await util.promisify(fs.writeFile)(argv.outputFile, script);
    } else {
        console.log(script);
    }
}