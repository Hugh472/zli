import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import {  handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, killDaemon, getBaseDaemonArgs, getOrDefaultLocalhost, getOrDefaultLocalport } from '../../utils/daemon-utils';
import { DbTargetSummary } from '../../../webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { connectArgs } from './connect.command-builder';
import yargs from 'yargs';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { listDbTargets } from '../../utils/list-utils';

const { spawn } = require('child_process');


export async function dbConnectHandler(argv: yargs.Arguments<connectArgs>, targetName: string,  configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService): Promise<number> {
    // First ensure the target is online
    const dbTargets = await listDbTargets(logger, configService);
    const dbTarget = await getDbTargetInfoFromName(dbTargets, targetName, logger);
    if (dbTarget.status != TargetStatus.Online) {
        logger.error('Target is offline!');
        return 1;
    }

    // Make our API client
    const policyService = new PolicyQueryHttpService(configService, logger);

    // Now check that the user has the correct OPA permissions (we will do this again when the daemon starts)
    const response = await policyService.CheckProxy(dbTarget.id, dbTarget.remoteHost, dbTarget.remotePort, TargetType.Db);
    if (response.allowed != true) {
        logger.error(`You do not have the correct policy setup to access ${dbTarget.name}!`);
        return 1;
    }

    // Open up our zli dbConfig
    const dbConfig = configService.getDbConfig();

    // Set our local host
    const localHost = getOrDefaultLocalhost(dbTarget.localHost);

    // Make sure we have set our local daemon port
    const localPort = await getOrDefaultLocalport(dbTarget.localPort, dbConfig.localPort, logger);

    // Note: These values will only be saved if we are not running in debug mode
    dbConfig.localPort = localPort;
    dbConfig.localHost = localHost;
    dbConfig.name = dbTarget.name;

    // Check if we've already started a process
    if (dbConfig.localPid != null) {
        killDaemon(dbConfig.localPid, dbConfig.localPort, logger);
    }

    // Build our args and cwd
    const baseArgs = getBaseDaemonArgs(configService, loggerConfigService);
    const pluginArgs = [
        `-localPort=${localPort}`,
        `-localHost=${localHost}`,
        `-targetId=${dbTarget.id}`,
        `-remotePort=${dbTarget.remotePort}`,
        `-remoteHost=${dbTarget.remoteHost}`,
        `-plugin="db"`
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
            dbConfig.localPid = daemonProcess.pid;

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), dbConfig.localPort, dbConfig.localHost);

            logger.info(`Started db daemon at ${localHost}:${localPort} for ${targetName}`);

            configService.setDbConfig(dbConfig);
            return 0;
        } else {
            logger.warn(`Started db daemon in debug mode at ${localHost}:${localPort} for ${targetName}`);
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