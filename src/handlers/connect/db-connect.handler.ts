import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { getAppExecPath, isPkgProcess, getAppEntrypoint, startDaemonInDebugMode, copyExecutableToLocalDir, killDaemon } from '../../utils/daemon-utils';
import { DbTargetSummary } from '../../services/db-target/db-target.types';
import { TargetStatus } from '../../services/common.types';
import { PolicyQueryService } from '../../services/v1/policy-query/policy-query.service';
import { waitUntilUsedOnHost } from 'tcp-port-used';
import { connectArgs } from './connect.command-builder';
import yargs from 'yargs';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';

const { spawn } = require('child_process');
const findPort = require('find-open-port');


export async function dbConnectHandler(argv: yargs.Arguments<connectArgs>, targetName: string, dbTargets: Promise<DbTargetSummary[]>, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService): Promise<number> {
    // First ensure the target is online
    const dbTarget = await getDbTargetInfoFromName(await dbTargets, targetName, logger);
    if (dbTarget.status != TargetStatus.Online) {
        logger.error('Target is offline!');
        return 1;
    }

    // Make our API client
    const policyService = new PolicyQueryService(configService, logger);

    // Now check that the user has the correct OPA permissions (we will do this again when the daemon starts)
    const response = await policyService.Proxy(dbTarget.id, dbTarget.remoteHost, dbTarget.remotePort, TargetType.Db);
    if (response.allowed != true) {
        logger.error(`You do not have the correct policy setup to access ${dbTarget.name}!`);
        return 1;
    }

    // Build the refresh command so it works in the case of the pkg'd app which
    // is expecting a second argument set to internal main script
    // This is a work-around for pkg recursive binary issue see https://github.com/vercel/pkg/issues/897
    // https://github.com/vercel/pkg/issues/897#issuecomment-679200552
    const execPath = getAppExecPath();
    const entryPoint = getAppEntrypoint();

    // Open up our zli dbConfig
    const dbConfig = configService.getDbConfig();

    // If the config has a localport set use that, else generate our own
    let localPort = dbTarget.localPort;
    if (localPort == null) {

        // Make sure we have set our local daemon port
        if (dbConfig['localPort'] == null) {
            logger.info('First time running db connect, setting local daemon port');
            
            // Generate and set a localport + localhost
            const localPort = await findPort();
            dbConfig['localPort'] = localPort;
            dbConfig['localHost'] = 'localhost'

            // Save the name as well
            dbConfig['name'] = dbTarget.name;

            // Save these values so they don't need to be recreated
            configService.setDbConfig(dbConfig);
        }

        localPort = dbConfig['localPort'];
    }

    // Check if we've already started a process
    if (dbConfig['localPid'] != null) {
        killDaemon(dbConfig['localPid'], dbConfig['localPort'], logger);
    }

    // Build our args and cwd
    let args = [
        `-sessionId=${configService.sessionId()}`,
        `-daemonPort=${localPort}`,
        `-targetId=${dbTarget.id}`, 
        `-serviceURL=${configService.serviceUrl().slice(0, -1).replace('https://', '')}`,
        `-authHeader="${configService.getAuthHeader()}"`,
        `-configPath=${configService.configPath()}`,
        `-logPath="${loggerConfigService.daemonLogPath()}"`,
        `-refreshTokenCommand="${execPath + ' ' + entryPoint + ' refresh'}"`,
        `-remotePort=${dbTarget.remotePort}`,
        `-remoteHost=${dbTarget.remoteHost}`,
        `-plugin="db"`
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
            dbConfig['localPid'] = daemonProcess.pid;

            // Also save the name of the target to display
            dbConfig['name'] = dbTarget.name;

            // Wait for daemon HTTP server to be bound and running
            await waitUntilUsedOnHost(localPort, 'localhost', 100, 1000 * 20);
            logger.info(`Started db daemon at ${dbConfig['localHost']}:${localPort} for ${targetName}`); 


            configService.setDbConfig(dbConfig);
            logger.info(`Started db daemon at localhost:${localPort} for ${targetName}`);
            return 0;
        } else {
            logger.warn(`Started db daemon in debug mode at localhost:${localPort} for ${targetName}`);
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
            await cleanExit(0, logger);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Db Daemon: ${error}`);
        return 1;
    }
    return 0;
}

async function getDbTargetInfoFromName(dbTargets: DbTargetSummary[], targetName: string, logger: Logger): Promise<DbTargetSummary> {
    for (const dbTarget of dbTargets) {
        if (dbTarget.name == targetName) {
            return dbTarget;
        }
    }
    logger.error('Unable to find db target!');
    await cleanExit(1, logger);
}