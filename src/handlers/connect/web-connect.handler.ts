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
        return 1;
    }

    // Make our API client
    const policyService = new PolicyQueryHttpService(configService, logger);

    // Now check that the user has the correct OPA permissions (we will do this again when the daemon starts)
    const response = await policyService.CheckProxy(webTarget.id, webTarget.remoteHost, webTarget.remotePort, TargetType.Web);
    if (response.allowed != true) {
        logger.error(`You do not have the correct policy setup to access ${webTarget.name}!`);
        return 1;
    }

    // Open up our zli dbConfig
    const webConfig = configService.getWebConfig();

    // Set our local host
    const localHost = getOrDefaultLocalhost(webTarget.localHost);

    // Make sure we have set our local daemon port
    const localPort = await getOrDefaultLocalport(webTarget.localPort, webConfig.localPort, logger);

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

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), webConfig.localPort, webConfig.localHost);

            configService.setWebConfig(webConfig);
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