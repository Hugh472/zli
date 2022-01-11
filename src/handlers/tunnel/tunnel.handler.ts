import path from 'path';
import utils from 'util';
import fs from 'fs';
import { killDaemon } from '../../services/v1/kube/kube.service';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import yargs from 'yargs';
import { tunnelArgs } from './tunnel.command-builder';
import { waitUntilUsedOnHost } from 'tcp-port-used';
import got from 'got/dist/source';
import { Retrier } from '@jsier/retrier';
import { getAppExecPath, isPkgProcess, getAppEntrypoint, startDaemonInDebugMode } from '../../utils/daemon-utils';
import { TargetStatus } from '../../services/common.types';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { AgentStatus } from '../../../webshell-common-ts/http/v2/target/kube/types/agent-status.types';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';
const { spawn } = require('child_process');


export async function startKubeDaemonHandler(argv: yargs.Arguments<tunnelArgs>, targetUser: string, targetGroups: string[], targetCluster: string, clusterTargets: Promise<KubeClusterSummary[]>, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
    // First check that the cluster is online
    const clusterTarget = await getClusterInfoFromName(await clusterTargets, targetCluster, logger);
    if (clusterTarget.status != AgentStatus.Online) {
        logger.error('Target cluster is offline!');
        await cleanExit(1, logger);
    }

    // Open up our zli kubeConfig
    const kubeConfig = configService.getKubeConfig();

    // Make sure the user has created a kubeConfig before
    if (kubeConfig['keyPath'] == null) {
        logger.error('Please make sure you have created your kubeconfig before running proxy. You can do this via "zli generate kubeConfig"');
        await cleanExit(1, logger);
    }

    // If they have not passed targetGroups attempt to use the default ones stored
    if (targetGroups.length == 0 && kubeConfig['defaultTargetGroups'] != null) {
        targetGroups = kubeConfig['defaultTargetGroups'];
    }

    // Make our API client
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);

    // Now check that the user has the correct OPA permissions (we will do this again when the daemon starts)
    const response = await policyQueryHttpService.CheckKubeTunnel(targetUser, clusterTarget.id, targetGroups);
    if (response.allowed != true) {
        logger.error(`You do not have the correct policy setup to access ${targetCluster} as ${targetUser} in the group(s): ${targetGroups}`);
        await cleanExit(1, logger);
    }

    // Check if we've already started a process
    if (kubeConfig['localPid'] != null) {
        killDaemon(configService, logger);
    }

    // See if the user passed in a custom port
    let daemonPort = kubeConfig['localPort'].toString();
    if (argv.customPort != -1) {
        daemonPort = argv.customPort.toString();
    }

    // Build the refresh command so it works in the case of the pkg'd app which
    // is expecting a second argument set to internal main script
    // This is a work-around for pkg recursive binary issue see https://github.com/vercel/pkg/issues/897
    // https://github.com/vercel/pkg/issues/897#issuecomment-679200552
    const execPath = getAppExecPath();
    const entryPoint = getAppEntrypoint();

    // Build our args and cwd
    let args = [
        `-sessionId=${configService.sessionId()}`,
        `-targetUser=${targetUser}`,
        `-targetGroups=${targetGroups}`,
        `-targetId=${clusterTarget.id}`,
        `-daemonPort=${daemonPort}`,
        `-serviceURL=${configService.serviceUrl().slice(0, -1).replace('https://', '')}`,
        `-authHeader="${configService.getAuthHeader()}"`,
        `-localhostToken="${kubeConfig['token']}"`,
        `-certPath="${kubeConfig['certPath']}"`,
        `-keyPath="${kubeConfig['keyPath']}"`,
        `-configPath=${configService.configPath()}`,
        `-logPath="${loggerConfigService.daemonLogPath()}"`,
        `-refreshTokenCommand="${execPath + ' ' + entryPoint + ' refresh'}"`,
        `-plugin="kube"`
    ];
    let cwd = process.cwd();

    // Copy over our executable to a temp file
    let finalDaemonPath = '';
    if (process.env.ZLI_CUSTOM_DAEMON_PATH) {
        // If we set a custom path, we will try to start the daemon from the source code
        cwd = process.env.ZLI_CUSTOM_DAEMON_PATH;
        finalDaemonPath = 'go';
        args = ['run', 'daemon.go'].concat(args);
    } else {
        finalDaemonPath = await copyExecutableToLocalDir(logger, configService.configPath());
    }

    try {
        if (!argv.debug) {
            // If we are not debugging, start the go subprocess in the background
            const options = {
                cwd: cwd,
                detached: true,
                shell: true,
                stdio: ['ignore', 'ignore', 'ignore']
            };

            const daemonProcess = await spawn(finalDaemonPath, args, options);

            // Now save the Pid so we can kill the process next time we start it
            kubeConfig['localPid'] = daemonProcess.pid;

            // Save the info about target user and group
            kubeConfig['targetUser'] = targetUser;
            kubeConfig['targetGroups'] = targetGroups;
            kubeConfig['targetCluster'] = targetCluster;
            configService.setKubeConfig(kubeConfig);

            // Wait for daemon HTTP server to be bound and running
            await waitUntilUsedOnHost(parseInt(daemonPort), 'localhost', 100, 1000 * 5);

            // Poll ready endpoint
            logger.info('Waiting for daemon to become ready...');
            await pollDaemonReady(kubeConfig['localPort']);
            logger.info(`Started kube daemon at ${kubeConfig['localHost']}:${kubeConfig['localPort']} for ${targetUser}@${targetCluster}`);
            await cleanExit(0, logger);
        } else {
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Kube Daemon: ${error}`);
        await cleanExit(1, logger);
    }
}

async function getClusterInfoFromName(clusterTargets: KubeClusterSummary[], clusterName: string, logger: Logger): Promise<KubeClusterSummary> {
    for (const clusterTarget of clusterTargets) {
        if (clusterTarget.clusterName == clusterName) {
            return clusterTarget;
        }
    }
    logger.error('Unable to find cluster!');
    await cleanExit(1, logger);
}

function pollDaemonReady(daemonPort: number) : Promise<void> {
    // 2 minutes
    const retrier = new Retrier({
        limit: 120,
        delay: 1000 * 1,
    });

    return retrier.resolve(async () => {
        const isDaemonReadyResp = await got.get(`https://localhost:${daemonPort}/bastionzero-ready`, { throwHttpErrors: false, https: { rejectUnauthorized: false } });

        if (isDaemonReadyResp.statusCode === 200) {
            return;
        } else {
            throw new Error('Daemon took too long to become ready');
        }
    });
}

// TODO: Remove this and pull from common daemon utils
async function copyExecutableToLocalDir(logger: Logger, configPath: string): Promise<string> {
    // Helper function to copy the Daemon executable to a local dir on the file system
    // Ref: https://github.com/vercel/pkg/issues/342

    const WINDOWS_DAEMON_PATH : string = 'bzero/bctl/daemon/daemon-windows';
    const LINUX_DAEMON_PATH   : string = 'bzero/bctl/daemon/daemon-linux';
    const MACOS_DAEMON_PATH   : string = 'bzero/bctl/daemon/daemon-macos';

    let prefix = '';
    if(isPkgProcess()) {
        // /snapshot/zli/dist/src/handlers/tunnel
        prefix = path.join(__dirname, '../../../../');
    } else {
        // /zli/src/handlers/tunnel
        prefix = path.join(__dirname, '../../../');
    }

    // First get the parent dir of the config path
    const configFileDir = path.dirname(configPath);

    const chmod = utils.promisify(fs.chmod);

    // Our copy function as we cannot use fs.copyFileSync
    async function copy(source: string, target: string) {
        return new Promise<void>(async function (resolve, reject) {
            const ret = await fs.createReadStream(source).pipe(fs.createWriteStream(target), { end: true });
            ret.on('close', () => {
                resolve();
            });
            ret.on('error', () => {
                reject();
            });
        });

    }

    let daemonExecPath = undefined;
    let finalDaemonPath = undefined;
    if (process.platform === 'win32') {
        daemonExecPath = path.join(prefix, WINDOWS_DAEMON_PATH);

        finalDaemonPath = path.join(configFileDir, 'daemon-windows.exe');
    }
    else if (process.platform === 'linux' || process.platform === 'darwin') {
        if (process.platform === 'linux') {
            daemonExecPath = path.join(prefix, LINUX_DAEMON_PATH);
        } else {
            daemonExecPath = path.join(prefix, MACOS_DAEMON_PATH);
        }

        finalDaemonPath = path.join(configFileDir, 'daemon');
    } else {
        logger.error(`Unsupported operating system: ${process.platform}`);
        await cleanExit(1, logger);
    }

    await deleteIfExists(finalDaemonPath);

    // Create our executable file
    fs.writeFileSync(finalDaemonPath, '');

    // Copy the file to the computers file system
    await copy(daemonExecPath, finalDaemonPath);

    // Grant execute permission
    await chmod(finalDaemonPath, 0o755);

    // Return the path
    return finalDaemonPath;
}


async function deleteIfExists(pathToFile: string) {
    // Check if the file exists, delete if so
    if (fs.existsSync(pathToFile)) {
        // Delete the file
        fs.unlinkSync(pathToFile);
    }
}