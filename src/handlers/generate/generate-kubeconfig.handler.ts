import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import util from 'util';
import { exec } from 'child_process';
import yargs from 'yargs';
import { generateConfigArgs } from './generate-config.command-builder';
import { cleanExit } from '../clean-exit.handler';
import { generateNewCert } from '../../utils/daemon-utils';

const path = require('path');
const fs = require('fs');
const findPort = require('find-open-port');
const tmp = require('tmp');
const randtoken = require('rand-token');
const execPromise = util.promisify(exec);

export async function generateKubeConfigHandler(
    argv: yargs.Arguments<generateConfigArgs>,
    configService: ConfigService,
    logger: Logger
) {
    // Check if we already have generated a cert/key
    let kubeConfig = configService.getKubeConfig();

    if (kubeConfig['keyPath'] == null) {
        logger.info('No KubeConfig has been generated before, generating key and cert for local daemon...');

        // Create and save key/cert
        try {
            // Get the path of where we want to save
            const pathToConfig = path.dirname(configService.configPath());
            const configName = configService.getConfigName();

            const [pathToKey, pathToCert, pathToCsr] = await generateNewCert(pathToConfig, 'kube', configName);

            // Generate a token that can be used for auth
            const token = randtoken.generate(128);

            // Find a local port to use for our daemon
            const localPort = await findPort();

            // Now save the path in the configService
            kubeConfig = {
                keyPath: pathToKey,
                certPath: pathToCert,
                csrPath: pathToCsr,
                token: token,
                localHost: 'localhost',
                localPort: localPort,
                localPid: null,
                targetUser: null,
                targetGroups: null,
                targetCluster: null,
                defaultTargetGroups: null
            };
            configService.setKubeConfig(kubeConfig);
        } catch (e: any) {
            logger.error(`Error creating cert for local daemon: ${e}`);
            await cleanExit(1, logger);
        }
    }

    // See if the user passed in a custom port
    let daemonPort = kubeConfig['localPort'].toString();
    if (argv.customPort != -1) {
        daemonPort = argv.customPort.toString();
    }

    // Determine if this is using the dev or stage config
    const configName = configService.getConfigName();
    let clusterName = 'bctl-agent';
    let contextName = 'bzero-context';
    let userName = configService.me()['email'];

    // If this is dev or stage, add that appropriate flag
    if (configName === 'dev' || configName === 'stage') {
        clusterName += `-${configName}`;
        userName += `-${configName}`;
        contextName += `-${configName}`;
    }

    // Now generate a kubeConfig
    const clientKubeConfig = `
apiVersion: v1
clusters:
- cluster:
    server: https://${kubeConfig['localHost']}:${daemonPort}
    insecure-skip-tls-verify: true
  name: ${clusterName}
contexts:
- context:
    cluster: ${clusterName}
    user: ${userName}
  name: ${contextName}
current-context: ${contextName}
preferences: {}
users:
  - name: ${userName}
    user:
      token: "${kubeConfig['token']}"
    `;

    // Show it to the user or write to file
    if (argv.outputFile) {
        await util.promisify(fs.writeFile)(argv.outputFile, clientKubeConfig);
    } else if (argv.update) {
        try {
            await flattenKubeConfig(clientKubeConfig, logger);
        } catch (e: any) {
            logger.error(`Error generating new kube config: ${e}`);
            await cleanExit(1, logger);
        }
        logger.info('Updated existing kube config!');
    } else {
        console.log(clientKubeConfig);
    }
}

async function flattenKubeConfig(config: string, logger: Logger) {
    // Helper function to flatten existing kubeConfig and new config

    // Define our kubeConfigPath
    // define our kube config dir (i.e. ~/.kube/config)
    const kubeConfigDir = path.join(process.env.HOME, '/.kube/');

    // Get the kube config path that the user is using, or use default
    const kubeConfigPath = process.env.KUBECONFIG || path.join(kubeConfigDir, 'config');

    // First ensure we have an existing config file
    try {
        if (!fs.existsSync(kubeConfigPath)) {
            // Existing kubeConfig does not exist, just copy the config to the kubeConfigPath
            fs.writeFileSync(kubeConfigPath, config);
            return;
        }
    } catch (err) {
        logger.error(`Error checking if existing KubeConfig file exists. Failed to check path: ${kubeConfigPath}`);
        await cleanExit(1, logger);
    }

    // Wrap this code into a promise so we can await it
    const flattenKubeConfigPromise = new Promise<void>(async (resolve, reject) => {
        // First lets create a temp file to write to
        tmp.file(async function _tempFileCreated(err: any, tempFilePath: string, fd: any, cleanupCallback: any) {
            if (err) {
                logger.error('Error creating temp file!');
                reject();
                return;
            }

            // Write out kube config to that file
            fs.writeFileSync(tempFilePath, config);

            // Create backup of kubeconfig
            const backupFilePath = path.join(kubeConfigDir, 'config.bzero.bak');
            fs.copyFileSync(kubeConfigPath, backupFilePath);

            // Create our custom exec env
            // We use the backupFilePath here, as we cannot merge the existing kubeConfigPath and pipe it to itself
            // Ref: https://stackoverflow.com/questions/46184125/how-to-merge-kubectl-config-file-with-kube-config
            // Order here also matters, we want the current context to come from our config, not the existing config
            const execEnv = {
                'KUBECONFIG': `${tempFilePath}:${backupFilePath}`,
                'PATH': process.env.PATH // Incase the user installs kubectl not in `/usr/local/bin`
            };

            // Not attempt to merge the two
            await execPromise(`kubectl config view --flatten > ${kubeConfigPath}`, { env: execEnv });

            // Return, clean up the temp file and, resolve the promise
            cleanupCallback();
            resolve();
        });
    });
    await flattenKubeConfigPromise;
}