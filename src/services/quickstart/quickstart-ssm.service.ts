import { cleanExit } from '../../handlers/clean-exit.handler';
import { SSHConfigHostBlock, SSHHost, SSHHostConfig } from './quickstart-ssm.service.types';
import { EnvironmentService } from '../environment/environment.service';
import { getAutodiscoveryScript } from '../auto-discovery-script/auto-discovery-script.service';
import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
import { SsmTargetService } from '../ssm-target/ssm-target.service';
import { TargetStatus } from '../common.types';

import SSHConfig from 'ssh2-promise/lib/sshConfig';
import SSHConnection from 'ssh2-promise/lib/sshConnection';
import path from 'path';
import os from 'os';
import pRetry from 'p-retry';

export class QuickstartSsmService {
    constructor(
        private logger: Logger,
        private configService: ConfigService,
    ) { }

    /**
     * Polls the bastion (using exponential backoff) until the SSM target is Online and the agent version is known.
     * @param ssmTargetId The ID of the target to poll
     * @returns Information about the target
     */
    public async pollSsmTargetOnline(ssmTargetId : string) {
        const run = async () => {
            const ssmTargetService = new SsmTargetService(this.configService, this.logger);

            const target = await ssmTargetService.GetSsmTarget(ssmTargetId);

            if (target.status === TargetStatus.Online && target.agentVersion !== '') {
                return target;
            } else {
                this.logger.debug(`Target ${target.name} has status:${target.status.toString()} and agentVersion:${target.agentVersion}`);
                throw new Error(`Target ${target.name} is not online`);
            }
        }
        const result = await pRetry(run, {
            retries: 15,
            minTimeout: 1000 * 10,
            maxRetryTime: 1000 * 120,
        });

        return result;
    }

    /**
     * Connects to an SSH host and runs the universal autodiscovery script on it.
     * @param sshConfig SSH configuration to use when building the SSH connection
     * @param hostName Name of SSH host to use in log messages
     * @returns The SSM target ID of the newly registered machine
     */
    public async runAutodiscoveryOnSSHHost(sshConfig: SSHConfig, hostName: string): Promise<string> {
        // Start SSH connection
        var ssh = new SSHConnection(sshConfig);
        let conn: SSHConnection;
        try {
            conn = await ssh.connect(sshConfig);
            this.logger.debug(`SSH connection established with host: ${hostName}`);
        }
        catch (error) {
            throw new Error(`Failed to establish SSH connection: ${error}`);
        }

        // Get autodiscovery script
        const envService = new EnvironmentService(this.configService, this.logger);
        const envs = await envService.ListEnvironments();
        const defaultEnv = envs.find(envDetails => envDetails.name == "Default");
        if (!defaultEnv) {
            this.logger.error('Default environment not found!');
            await cleanExit(1, this.logger);
        }
        let script = await getAutodiscoveryScript(this.logger, this.configService, defaultEnv, { scheme: 'hostname' }, 'universal', 'latest');

        // Run script on target
        const execAutodiscoveryScriptCmd = `bash << 'endmsg'\n${script}\nendmsg`
        const execAutodiscoveryScript = new Promise<string>(async (resolve, reject) => {
            conn.spawn(execAutodiscoveryScriptCmd)
                .then(socket => {
                    this.logger.debug(`Running autodiscovery script on host: ${hostName}`);

                    // Store last printed message on stdout
                    let lastOutput = "";

                    socket.on('data', (data: Buffer) => {
                        // Log stdout
                        const dataAsStr = data.toString();
                        this.logger.debug(`STDOUT: ${dataAsStr}`);
                        lastOutput = dataAsStr;
                    });
                    socket.on('close', (code: number) => {
                        if (code == 0) {
                            this.logger.debug(`Successfully executed autodiscovery script on host: ${hostName}`);

                            const targetKeyword = "TARGET_ID=";
                            const indexOfTargetKeyword = lastOutput.indexOf(targetKeyword);
                            if (indexOfTargetKeyword == -1) {
                                reject(`Failed to find ${targetKeyword} in last message printed by stdout`);
                                return;
                            }

                            const targetId = lastOutput.slice(indexOfTargetKeyword).substring(targetKeyword.length).trim();
                            resolve(targetId);
                            return;
                        } else {
                            reject(`Failed to execute autodiscovery script. Error code: ${code}`);
                            return;
                        }
                    });
                })
                .catch(err => {
                    reject(`Failed to start autodiscovery script on host: ${hostName}. ${err}`);
                });
        });

        return await execAutodiscoveryScript
            .finally(async () => {
                this.logger.debug(`Closing SSH connection with host: ${hostName}`);
                await conn.close();
                this.logger.debug(`Closed SSH connection with host: ${hostName}`);
            });
    }

    /**
     * Parse SSH hosts from a valid ssh_config(5) (https://linux.die.net/man/5/ssh_config)
     * @param sshConfig Contents of the ssh config file
     * @returns A tuple of Maps. The first tuple contains a mapping of valid SSH host name:Valid SSHHost. The second tuple contains a mapping of SSH host name:string[], where string[] is a list of parse errors that occurred.
     */
    public parseSSHHosts(sshConfig: string): [hosts: Map<string, SSHHost>, parseErrors: Map<string, string[]>] {
        // Parse valid ssh hosts 
        const SSHConfig = require('ssh-config');
        const config: [] = SSHConfig.parse(sshConfig);
        const hostBlocks: SSHConfigHostBlock[] = config.filter((elem: any) => elem.param === "Host");

        let hosts: Map<string, SSHHost> = new Map();
        let parseErrorsMap: Map<string, string[]> = new Map();

        for (const hostBlock of hostBlocks) {
            let name = hostBlock.value;
            if (hosts.has(name) || parseErrorsMap.has(name)) {
                this.logger.warn(`Warning: Already seen SSH host with Host == ${name}. Keeping the first one.`);
                continue;
            }

            // Skip global directive
            // TODO-Yuval: Should we support the global directive. E.g. global IdentityFile?
            if (name === "*") {
                continue;
            }
            let parseErrors: string[] = [];
            const config = hostBlock.config;

            const hostIp = this.getSSHHostConfigValue("HostName", config);
            if (hostIp === undefined) {
                parseErrors.push('Missing required parameter: HostName');
            }
            let port = this.getSSHHostConfigValue("Port", config);
            if (port === undefined) {
                this.logger.warn(`Warning: Missing Port parameter for host: ${name}. Assuming port 22.`);
                port = '22';
            }
            const user = this.getSSHHostConfigValue("User", config);
            if (user === undefined) {
                parseErrors.push('Missing required parameter: User');
            }
            const identityFilePath = this.getSSHHostConfigValue("IdentityFile", config);
            if (identityFilePath === undefined) {
                parseErrors.push('Missing required parameter: IdentityFile');
            }

            if (parseErrors.length > 0) {
                parseErrorsMap.set(name, parseErrors);
                this.logger.debug(`Failed to parse host: ${name}`);
                continue;
            }

            hosts.set(name, {
                name: name,
                hostIp: hostIp,
                port: parseInt(port),
                username: user,
                identityFile: this.resolveHome(identityFilePath)
            });
        }

        return [hosts, parseErrorsMap];
    }

    private getSSHHostConfigValue(matchingParameter: string, hostConfig: SSHHostConfig[]): string {
        const value = hostConfig.find(elem => elem.param === matchingParameter);
        if (value === undefined) {
            return undefined;
        } else {
            return value.value;
        }
    }

    private resolveHome(filepath: string) {
        if (filepath[0] === '~') {
            return path.join(os.homedir(), filepath.slice(1));
        }
        return filepath;
    }
}