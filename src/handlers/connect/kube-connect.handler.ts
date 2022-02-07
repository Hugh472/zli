import yargs from 'yargs';
import got from 'got/dist/source';
import { Retrier } from '@jsier/retrier';
const { spawn } = require('child_process');

import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { connectArgs } from './connect.command-builder';
import { getAppExecPath, getAppEntrypoint, startDaemonInDebugMode, killDaemon, copyExecutableToLocalDir, handleServerStart } from '../../utils/daemon-utils';
import { KubeClusterSummary } from '../../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetStatus.types';


export async function startKubeDaemonHandler(argv: yargs.Arguments<connectArgs>, targetUser: string, targetGroups: string[], targetCluster: string, clusterTargets: Promise<KubeClusterSummary[]>, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService): Promise<number> {
    // First check that the cluster is online
    logger.info(`${await clusterTargets}`);

    const clusterTarget = await getClusterInfoFromName(await clusterTargets, targetCluster, logger);
    if (clusterTarget.status != TargetStatus.Online) {
        logger.error('Target cluster is offline!');
        return 1;
    }

    // Open up our zli kubeConfig
    const kubeConfig = configService.getKubeConfig();

    // Make sure the user has created a kubeConfig before
    if (kubeConfig['keyPath'] == null) {
        logger.error('Please make sure you have created your kubeconfig before running proxy. You can do this via "zli generate kubeConfig"');
        return 1;
    }

    // If they have not passed targetGroups attempt to use the default ones stored
    if (targetGroups.length == 0 && kubeConfig['defaultTargetGroups'] != null) {
        targetGroups = kubeConfig['defaultTargetGroups'];
    }

    // Make our API client
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);

    // Now check that the user has the correct OPA permissions (we will do this again when the daemon starts)
    const response = await policyQueryHttpService.CheckKubernetes(targetUser, clusterTarget.id, targetGroups);
    if (response.allowed != true) {
        logger.error(`You do not have the correct policy setup to access ${targetCluster} as ${targetUser} in the group(s): ${targetGroups}`);
        return 1;
    }

    // Check if we've already started a process
    if (kubeConfig['localPid'] != null) {
        killDaemon(kubeConfig['localPid'], kubeConfig['localPort'], logger);
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
        `-localPort=${daemonPort}`,
        `-localHost=localhost`, // Currently kube does not support editing localhost
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
            await handleServerStart(loggerConfigService.daemonLogPath(), parseInt(daemonPort), kubeConfig['localHost']);

            // Poll ready endpoint
            logger.info('Waiting for daemon to become ready...');
            await pollDaemonReady(kubeConfig['localPort']);
            logger.info(`Started kube daemon at ${kubeConfig['localHost']}:${kubeConfig['localPort']} for ${targetUser}@${targetCluster}`);
            return 0;
        } else {
            logger.warn(`Started kube daemon in debug mode at ${kubeConfig['localHost']}:${kubeConfig['localPort']} for ${targetUser}@${targetCluster}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Kube Daemon: ${error}`);
        return 1;
    }
}

async function getClusterInfoFromName(clusterTargets: KubeClusterSummary[], clusterName: string, logger: Logger): Promise<KubeClusterSummary> {
    logger.info(`HERE: ${clusterTargets}`);
    logger.info(`HERE: ${clusterName}`);

    for (const clusterTarget of clusterTargets) {
        if (clusterTarget.name == clusterName) {
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