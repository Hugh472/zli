import { sshProxyConfigHandler } from '../ssh-proxy-config.handler';

export function generateSSHProxyHandler() {
    // ref: https://nodejs.org/api/process.html#process_process_argv0
    let processName = process.argv0;

    // handle npm install edge case
    // note: node will also show up when running 'npm run start -- ssh-proxy-config'
    // so for devs, they should not rely on generating configs from here and should
    // map their dev executables in the ProxyCommand output
    if(processName.includes('node')) processName = 'zli';

    sshProxyConfigHandler(this.configService, this.logger, processName);
}