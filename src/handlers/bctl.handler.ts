import { ConfigService } from '../services/config/config.service';
import { Logger } from '../services/logger/logger.service';
import { cleanExit } from './clean-exit.handler';
import util from 'util';
import { spawn, exec } from 'child_process';

const { v4: uuidv4 } = require('uuid');
const execPromise = util.promisify(exec);
const isRunning = require('is-running');


export async function bctlHandler(configService: ConfigService, logger: Logger, listOfCommands: string[]) {
    // Check if daemon is even running
    const kubeConfig = configService.getKubeConfig();
    if (kubeConfig['localPid'] == null) {
        logger.warn('No Kube daemon running');
        await cleanExit(1, logger);
    }

    // Print as what user we are running the command as, and to which container
    logger.info(`Connected as ${kubeConfig['targetUser']} to cluster ${kubeConfig['targetCluster']}`);

    // Then get the token
    const token = kubeConfig['token'];

    // Now generate a log id
    const logId = uuidv4();

    // Now build our token
    const kubeArgsString = listOfCommands.join(' ');

    // We use '++++' as a delimiter so that we can parse the engligh command, logId, token in the daemon
    const formattedToken = `${token}++++zli kube ${kubeArgsString}++++${logId}`;

    // Add the token to the args
    let kubeArgs: string[] = ['--token', formattedToken];

    // Then add the extract the args
    kubeArgs = kubeArgs.concat(listOfCommands);

    const kubeCommandProcess = await spawn('kubectl', kubeArgs, { stdio: [process.stdin, process.stdout, process.stderr] });

    kubeCommandProcess.on('close', async (code: number) => {
        logger.debug(`Kube command process exited with code ${code}`);

        if (code != 0) {
            // Check if the daemon has quit
            if (kubeConfig['localPid'] == null || !isRunning(kubeConfig['localPid'])) {
                logger.error('The Kube Daemon has quit unexpectedly.');
                kubeConfig['localPid'] = null;
                configService.setKubeConfig(kubeConfig);
                await cleanExit(0, logger);
                return;
            }

            // Then ensure we have kubectl installed
            try {
                await execPromise('kubectl --help');
            } catch {
                logger.warn('Please ensure you have kubectl installed!');
                await cleanExit(1, logger);
                return;
            }

            // Check to ensure they are using the right context
            const currentContext = await execPromise('kubectl config current-context');
            if (currentContext.stdout.trim() != 'bctl-agent') {
                logger.warn('Make sure you using the correct kube config!');
                await cleanExit(1, logger);
                return;
            }
        }
    });
}