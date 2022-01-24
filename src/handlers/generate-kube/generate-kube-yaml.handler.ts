import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import util from 'util';
import { cleanExit } from '../clean-exit.handler';
import yargs from 'yargs';
import { generateKubeArgs } from './generate-kube.command-builder';
import { getEnvironmentFromName } from '../../../src/utils/utils';
import { EnvironmentSummary } from '../../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { KubeService } from '../../services/v1/kube/kube.service';

const fs = require('fs');


export async function generateKubeYamlHandler(
    argv: yargs.Arguments<generateKubeArgs>,
    envs: Promise<EnvironmentSummary[]>,
    configService: ConfigService,
    logger: Logger
) {
    // First check all the required args
    if (argv.clusterName == null) {
        logger.error('Please make sure you have passed the clusterName positional argument before trying to generate a yaml!');
        await cleanExit(1, logger);
    }

    const outputFileArg = argv.outputFile;

    // Make our API client
    // TODO: Uncomment this out once our v2 endpoint is fixed
    // const kubeHttpService = new KubeHttpService(configService, logger);
    const kubeHttpService = new KubeService(configService, logger);

    // Format our labels if they exist
    const labels: { [index: string ]: string } = {};
    if (argv.labels != []) {
        for (const keyValueString of argv.labels) {
            const key = keyValueString.split(':')[0];
            const value = String(keyValueString.split(':')[1]);
            labels[key] = value;
        }
    }

    // If environment has been passed, ensure it's a valid envId
    let environmentId = null;
    if (argv.environmentName != null) {
        const environment = await getEnvironmentFromName(argv.environmentName, await envs, logger);
        environmentId = environment.id;
    }

    // Get our kubeYaml
    // TODO: Uncomment this out once our v2 endpoint is fixed
    // const kubeYaml = await kubeHttpService.CreateNewAgentToken(argv.clusterName, labels, argv.namespace, environmentId);
    const kubeYaml = await kubeHttpService.getKubeUnregisteredAgentYaml(argv.clusterName, labels, argv.namespace, environmentId);

    // Show it to the user or write to file
    if (outputFileArg) {
        await util.promisify(fs.writeFile)(outputFileArg, kubeYaml.yaml);
        logger.info(`Wrote yaml to output file: ${outputFileArg}`);
    } else {
        console.log(kubeYaml.yaml);
    }
    await cleanExit(0, logger);
}