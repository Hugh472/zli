import util from 'util';

import { Logger } from '../logger.service/logger';
import { ConfigService } from '../config.service/config.service';
import { KubeService } from '../http.service/http.service';
import { cleanExit } from './clean-exit.handler';

const fs = require('fs');


export async function generateKubeYamlHandler(
    argv: any,
    configService: ConfigService,
    logger: Logger
) {
    // First check all the required args
    if (argv.clusterName == null) {
        logger.error('Please make sure you have passed a -clusterName before trying to generate a yaml!');
        await cleanExit(1, logger);
    }

    const outputFileArg = argv.outputFile;

    // Make our API client
    const kubeService = new KubeService(configService, logger);

    // Format our labels if they exist
    let labelsFormatted = null;
    if (argv.labels != []) {
        const labels: { [index: string ]: string } = {};
        for (const keyValueString of argv.labels) {
            const key = keyValueString.split(':')[0];
            const value = keyValueString.split(':')[1];
            labels[key] = value;
        }
        labelsFormatted = JSON.stringify(labels);
    }

    // Get our kubeYaml
    const kubeYaml = await kubeService.getKubeUnregisteredAgentYaml(argv.clusterName, labelsFormatted, argv.namespace);

    // Show it to the user or write to file
    if (outputFileArg) {
        await util.promisify(fs.writeFile)(outputFileArg, kubeYaml.yaml);
        logger.info(`Wrote yaml to output file: ${outputFileArg}`);
    } else {
        logger.info(kubeYaml.yaml);
    }
    await cleanExit(0, logger);
}