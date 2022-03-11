import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import {  handleServerStart, startDaemonInDebugMode, copyExecutableToLocalDir, getBaseDaemonArgs, getOrDefaultLocalhost, getOrDefaultLocalport, killLocalPortAndPid } from '../../utils/daemon-utils';
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
        await cleanExit(1, logger);
    }

    // Make our API client
    const policyService = new PolicyQueryHttpService(configService, logger);

    // If the user is an admin make sure they have a policy that allows access
    // to the target. If they are a non-admin then they must have a policy that
    // allows access to even be able to list and parse the target
    const me = configService.me();
    if(me.isAdmin) {
        const response = await policyService.ProxyPolicyQuery([dbTarget.id], TargetType.Db, me.email);
        if (response[dbTarget.id].allowed != true) {
            logger.error(`You do not have a Proxy policy setup to access ${dbTarget.name}!`);
            await cleanExit(1, logger);
        }
    }

    // Open up our zli dbConfig
    const dbConfig = configService.getDbConfig();

    // Set our local host
    const localHost = getOrDefaultLocalhost(dbTarget.localHost);

    // Make sure we have set our local daemon port
    let localPort = await getOrDefaultLocalport(dbTarget.localPort, dbConfig.localPort, logger);
    if (argv.customPort != -1) {
        localPort = argv.customPort;
    }

    // Note: These values will only be saved if we are not running in debug mode
    dbConfig.localPort = localPort;
    dbConfig.localHost = localHost;
    dbConfig.name = dbTarget.name;

    await killLocalPortAndPid(dbConfig.localPid, dbConfig.localPort, logger);

    // Build our args and cwd
    const baseArgs = getBaseDaemonArgs(configService, loggerConfigService, dbTarget.agentPublicKey);
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
            configService.setDbConfig(dbConfig);

            // Wait for daemon HTTP server to be bound and running
            await handleServerStart(loggerConfigService.daemonLogPath(), dbConfig.localPort, dbConfig.localHost);

            logger.info(`Started db daemon at ${localHost}:${localPort} for ${targetName}`);

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