import path from 'path';
import fs from 'fs';
import utils from 'util';
import { cleanExit } from '../handlers/clean-exit.handler';
import { Logger } from '../services/logger/logger.service';
const { spawn } = require('child_process');

export function getAppEntrypoint() {
    const pkgProcess = isPkgProcess();

    if(pkgProcess) {
        return pkgProcess.entrypoint;
    } else {
        return `${process.cwd()}/src/index.ts`;
    }
}

export function getAppExecPath() {
    if(isPkgProcess()) {
        return process.execPath;
    } else {
        return 'npx ts-node';
    }
}


export function isPkgProcess() {
    const process1 = <any>process;
    return process1.pkg;
}

export async function startDaemonInDebugMode(finalDaemonPath: string, cwd: string, args: string[]) {
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

export async function copyExecutableToLocalDir(logger: Logger, configPath: string): Promise<string> {
    // Helper function to copy the Daemon executable to a local dir on the file system
    // Ref: https://github.com/vercel/pkg/issues/342

    const WINDOWS_DAEMON_PATH : string = 'bzero/bctl/daemon/daemon-windows';
    const LINUX_DAEMON_PATH   : string = 'bzero/bctl/daemon/daemon-linux';
    const MACOS_DAEMON_PATH   : string = 'bzero/bctl/daemon/daemon-macos';

    let prefix = '';
    if(isPkgProcess()) {
        // /snapshot/zli/dist/src/handlers/tunnel
        prefix = path.join(__dirname, '../../../');
    } else {
        // /zli/src/handlers/tunnel
        prefix = path.join(__dirname, '../../');
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