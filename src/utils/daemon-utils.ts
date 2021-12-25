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