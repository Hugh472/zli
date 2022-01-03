import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import yargs from 'yargs';
import { dbConnectArgs } from './db-connect.command-builder';
import { exit } from 'process';
import { getAppExecPath, isPkgProcess, getAppEntrypoint, startDaemonInDebugMode } from '../../utils/daemon-utils';
import { DbTargetSummary } from '../../services/virtual-target/virtual-target.types';
import { TargetStatus } from '../../services/common.types';

const { spawn } = require('child_process');
const findPort = require('find-open-port');


export async function dbConnectHandler(argv: yargs.Arguments<dbConnectArgs>, targetName: string, dbTargets: Promise<DbTargetSummary[]>, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
    // First ensure the target is online
    const dbTarget = await getDbTargetInfoFromName(await dbTargets, targetName, logger);
    if (dbTarget.status != TargetStatus.Online) {
        logger.error('Target is offline!');
        await cleanExit(1, logger);
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

            // Save these values so they don't need to be recreated
            configService.setDbConfig(dbConfig);
        }

        localPort = dbConfig['localPort'];
    }
    

    logger.info(`Started db daemon at ${dbConfig['localHost']}:${localPort} for ${targetName}`); 

    // Golang does not accept "null" as params, so convert them to empty strings or -1
    let port = -1
    let host = ""
    let hostName = ""
    if (dbTarget.targetPort != null) {
        port = dbTarget.targetPort;
    }
    if (dbTarget.targetHost != null) {
        host = dbTarget.targetHost;
    }
    if (dbTarget.targetHostName != null) {
        hostName = dbTarget.targetHostName;
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
        `-targetPort=${port}`,
        `-targetHost=${host}`,
        `-targetHostName=${hostName}`,
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
        exit(1);
    }

    try {
        if (!argv.debug) {
           exit(1);
        } else {
            await startDaemonInDebugMode(finalDaemonPath, cwd, args);
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Db Daemon: ${error}`);
        await cleanExit(1, logger);
    }
}

async function getDbTargetInfoFromName(dbTargets: DbTargetSummary[], targetName: string, logger: Logger): Promise<DbTargetSummary> {
    for (const dbTarget of dbTargets) {
        if (dbTarget.targetName == targetName) {
            return dbTarget;
        }
    }
    logger.error('Unable to find db target!');
    await cleanExit(1, logger);
}