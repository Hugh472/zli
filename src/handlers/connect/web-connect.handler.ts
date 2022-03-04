import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import yargs from 'yargs';
import open from 'open';
import { handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getBaseDaemonArgs, getOrDefaultLocalhost, getOrDefaultLocalport, killLocalPortAndPid } from '../../utils/daemon-utils';
import { connectArgs } from './connect.command-builder';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { PolicyQueryHttpService } from '../../../src/http-services/policy-query/policy-query.http-services';
import { listWebTargets } from '../../utils/list-utils';
import { WebTargetSummary } from '../../../webshell-common-ts/http/v2/target/web/types/web-target-summary.types';

const { spawn } = require('child_process');


export async function webConnectHandler(argv: yargs.Arguments<connectArgs>, targetName: string, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService): Promise<number>{
    // First ensure the target is online
    const webTargets = await listWebTargets(logger, configService);
    const webTarget = await getWebTargetInfoFromName(webTargets, targetName, logger);
    if (webTarget.status != TargetStatus.Online) {
        logger.error('Target is offline!');
        await cleanExit(1, logger);
    }

    // Make our API client
    const policyService = new PolicyQueryHttpService(configService, logger);

    // If the user is an admin make sure they have a policy that allows access
    // to the target. If they are a non-admin then they must have a policy that
    // allows access to even be able to list and parse the target
    const me = configService.me();
    if(me.isAdmin) {
        const response = await policyService.ProxyPolicyQuery([webTarget.id], TargetType.Web, me.email);
        if (response[webTarget.id].allowed != true) {
            logger.error(`You do not have a Proxy policy setup to access ${webTarget.name}!`);
            await cleanExit(1, logger);
        }
    }

    // Open up our zli dbConfig
    const webConfig = configService.getWebConfig();

    // Set our local host
    const localHost = getOrDefaultLocalhost(webTarget.localHost);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(webTarget.localPort, webConfig.localPort, logger);
    if (argv.customPort != -1) {
        localPort = argv.customPort;
    }

    // Note: These values will only be saved if we are not running in debug mode
    webConfig.localPort = localPort;
    webConfig.localHost = localHost;
    webConfig.name = webTarget.name;

    await killLocalPortAndPid(webConfig.localPid, webConfig.localPort, logger);

    // Build our args and cwd
    const baseArgs = getBaseDaemonArgs(configService, loggerConfigService);
    const pluginArgs = [
        `-localPort=${localPort}`,
        `-localHost=${localHost}`,
        `-targetId=${webTarget.id}`,
        `-agentPubKey=${webTarget.agentPublicKey}`,
        `-remotePort=${webTarget.remotePort}`,
        `-remoteHost=${webTarget.remoteHost}`,
        `-plugin="web"`
    ];
    let args = baseArgs.concat(pluginArgs);

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
            webConfig.localPid = daemonProcess.pid;
            webConfig.localPort = localPort;
            webConfig.localHost = localHost;

            // Also save the name of the target to display
            webConfig.name = webTarget.name;
            configService.setWebConfig(webConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), webConfig.localPort, webConfig.localHost);

            logger.info(`Started web daemon at ${localHost}:${localPort} for ${targetName}`);

            // Open our browser window
            if(argv.openBrowser) {
                await open(`http://localhost:${localPort}`);
            }

            return 0;
        } else {
            logger.warn(`Started web daemon in debug mode at ${localHost}:${localPort} for ${targetName}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Web Daemon: ${error}`);
        return 1;
    }
}

async function getWebTargetInfoFromName(webTargets: WebTargetSummary[], targetName: string, logger: Logger): Promise<WebTargetSummary> {
    for (const webTarget of webTargets) {
        if (webTarget.name == targetName) {
            return webTarget;
        }
    }
    logger.error('Unable to find web target!');
    await cleanExit(1, logger);
}