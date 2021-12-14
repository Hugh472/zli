import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import yargs from 'yargs';
import { dbConnectArgs } from './db-connect.command-builder';
import { exit } from 'process';
const { spawn } = require('child_process');


export async function dbConnectHandler(argv: yargs.Arguments<dbConnectArgs>, configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
   

    // Build our args and cwd
    let args = [
        `-sessionId=${configService.sessionId()}`,
        `-serviceURL=${configService.serviceUrl().slice(0, -1).replace('https://', '')}`,
        `-authHeader="${configService.getAuthHeader()}"`,
        `-logPath="${loggerConfigService.daemonLogPath()}"`,
    ];
    let cwd = process.cwd();

    // Copy over our executable to a temp file
    let finalDaemonPath = '';
    if (process.env.ZLI_CUSTOM_DAEMON_PATH) {
        // If we set a custom path, we will try to start the daemon from the source code
        cwd = process.env.ZLI_CUSTOM_DAEMON_PATH;
        finalDaemonPath = 'go';
        args = ['run', 'main.go'].concat(args);
    } else {
        exit(1);
    }

    try {
        if (!argv.debug) {
           exit(1);
        } else {
            // Start our daemon process, but stream our stdio to the user (pipe)
            const daemonProcess = await spawn(finalDaemonPath, args,
                {
                    cwd: cwd,
                    shell: true,
                    detached: true,
                    stdio: 'inherit'
                }
            );

            process.on('SIGINT', () => {
                // CNT+C Sent from the user, kill the daemon process, which will trigger an exit
                if (process.platform === 'linux') {
                    spawn('pkill', ['-s', daemonProcess.pid], {
                        cwd: process.cwd(),
                        shell: true,
                        detached: true,
                        stdio: 'inherit'
                    });
                } else {
                    spawn('pkill', ['-P', daemonProcess.pid], {
                        cwd: process.cwd(),
                        shell: true,
                        detached: true,
                        stdio: 'inherit'
                    });
                }
            });

            daemonProcess.on('exit', function () {
                // Whenever the daemon exits, exit
                process.exit();
            });
        }
    } catch (error) {
        logger.error(`Something went wrong starting the Db Daemon: ${error}`);
        await cleanExit(1, logger);
    }
}