import { cleanExit } from '../../handlers/clean-exit.handler';
import { SSHConfigHostBlock, ValidSSHHost, SSHHostConfig, SSHConfigParseError, InvalidSSHHost } from './quickstart-ssm.service.types';
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
import prompts, { PromptObject } from 'prompts';

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
    public async pollSsmTargetOnline(ssmTargetId: string) {
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

    public async promptFixParseErrorsForHost(sshHostName: string, parseErrors: SSHConfigParseError[]): Promise<ValidSSHHost | undefined> {
        this.logger.info(`Please answer the following ${parseErrors.length} question(s) so that ${sshHostName} can be considered as a valid host to connect with BastionZero`);

        // Iterate through all parse errors for the passed in host and prompt
        // user to fix the problem.
        //
        // If the prompt is cancelled, undefined will be returned. We check for
        // this on each missing parameter, and return undefined as the return
        // value in order to short-circuit any remaining parse errors.
        let validSSHHost = {} as ValidSSHHost;
        validSSHHost.name = sshHostName;
        for (const parseError of parseErrors) {
            switch (parseError.error) {
                case "missing_host_name":
                    const hostName = await this.handleMissingHostName();
                    if (hostName === undefined) {
                        return undefined;
                    } else {
                        validSSHHost.hostIp = hostName;
                    }
                    break;
                case "missing_port":
                    const port = await this.handleMissingPort();
                    if (port === undefined) {
                        return undefined;
                    } else {
                        validSSHHost.port = port;
                    }
                    break;
                case "missing_user":
                    const user = await this.handleMissingUser();
                    if (user === undefined) {
                        return undefined;
                    } else {
                        validSSHHost.username = user;
                    }
                    break;
                case "missing_identity_file":
                    const identityFilePath = await this.handleMissingIdentityFile();
                    if (identityFilePath === undefined) {
                        return undefined;
                    } else {
                        validSSHHost.identityFile = identityFilePath;
                    }
                    break;
                default:
                    // Note: This error is never thrown at runtime. It is an
                    // exhaustive check at compile-time.
                    const exhaustiveCheck: never = parseError;
                    throw new Error(`Unhandled parse error type: ${exhaustiveCheck}`);
            }
        }

        return validSSHHost;
    }

    private async handleMissingHostName(): Promise<string | undefined> {
        return new Promise<string | undefined>(async (resolve, _) => {
            const onCancel = () => resolve(undefined);
            const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
            await prompts({
                type: 'text',
                name: 'value',
                message: 'Enter HostName (IP address or DNS name):',
                validate: value => value ? true : 'Value is required. Use CTRL-C to skip this host'
            }, { onSubmit: onSubmit, onCancel: onCancel });
        });
    }

    private async handleMissingPort(): Promise<number | undefined> {
        return new Promise<number | undefined>(async (resolve, _) => {
            const onCancel = () => resolve(undefined);
            const onSubmit = (_: PromptObject, answer: number) => resolve(answer);
            await prompts({
                type: 'number',
                name: 'value',
                message: 'Enter Port number:',
                initial: 22
            }, { onSubmit: onSubmit, onCancel: onCancel });
        });
    }

    private async handleMissingUser(): Promise<string | undefined> {
        return new Promise<string | undefined>(async (resolve, _) => {
            const onCancel = () => resolve(undefined);
            const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
            await prompts({
                type: 'text',
                name: 'value',
                message: 'Enter User:',
                validate: value => value ? true : 'Value is required. Use CTRL-C to skip this host'
            }, { onSubmit: onSubmit, onCancel: onCancel });
        });
    }

    private async handleMissingIdentityFile(): Promise<string | undefined> {
        return new Promise<string | undefined>(async (resolve, _) => {
            const onCancel = () => resolve(undefined);
            const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
            await prompts({
                type: 'text',
                name: 'value',
                message: 'Enter path to IdentityFile:',
                validate: value => value ? true : 'Value is required. Use CTRL-C to skip this host'
            }, { onSubmit: onSubmit, onCancel: onCancel });
        });
    }

    /**
     * Parse SSH hosts from a valid ssh_config(5)
     * (https://linux.die.net/man/5/ssh_config)
     * @param sshConfig Contents of the ssh config file
     * @returns A tuple of Maps.
     *
     * The first element contains a mapping of all valid SSH hosts. The key is
     * the SSH host's name. The value is an interface containing information
     * about the host. A valid SSH host is defined as one that has enough
     * information about it in the config file, so that it can be used with the
     * ssh2-promise library. There is no guarantee that a valid ssh host is
     * successfully connectable (e.g. network issue, encrypted key file, invalid
     * IP/host, file not found at path, etc.).
     *
     * The second tuple contains a mapping of all invalid SSH hosts. The key is
     * the invalid SSH host's name. The value is a list of parse errors that
     * occurred when reading the host from the config file.
     */
    public parseSSHHosts(sshConfig: string): [hosts: Map<string, ValidSSHHost>, invalidSSHHosts: InvalidSSHHost[]] {
        // Parse sshConfig content to usable HostBlock types
        const SSHConfig = require('ssh-config');
        const config: [] = SSHConfig.parse(sshConfig);
        const hostBlocks: SSHConfigHostBlock[] = config.filter((elem: any) => elem.param === "Host");

        let seen: Map<string, boolean> = new Map();
        let validHosts: Map<string, ValidSSHHost> = new Map();
        let invalidSSHHosts: InvalidSSHHost[] = [];

        for (const hostBlock of hostBlocks) {
            let name = hostBlock.value;
            // Skip global directive
            if (name === "*") {
                continue;
            }

            // Skip host if already found. Print warning to user. This behavior
            // is on par with how ssh works with duplicate hosts (the first host
            // is used and the second is skipped).
            if (seen.has(name)) {
                this.logger.warn(`Warning: Already seen SSH host with Host == ${name}. Keeping the first one seen.`);
                continue;
            }
            seen.set(name, true);

            // Array holds all config parse errors found while parsing
            let parseErrors: SSHConfigParseError[] = [];
            const config = hostBlock.config;

            // Parse required SSH config parameters
            const hostIp = this.getSSHHostConfigValue("HostName", config);
            if (hostIp === undefined) {
                parseErrors.push({ error: "missing_host_name" });
            }
            const port = this.getSSHHostConfigValue("Port", config);
            if (port === undefined) {
                parseErrors.push({ error: "missing_port" });
            }
            const user = this.getSSHHostConfigValue("User", config);
            if (user === undefined) {
                parseErrors.push({ error: "missing_user" });
            }
            const identityFilePath = this.getSSHHostConfigValue("IdentityFile", config);
            if (identityFilePath === undefined) {
                parseErrors.push({ error: "missing_identity_file" })
            }

            if (parseErrors.length > 0) {
                invalidSSHHosts.push({
                    name: name,
                    parseErrors: parseErrors
                });
                this.logger.debug(`Failed to parse host: ${name}`);
                continue;
            }

            validHosts.set(name, {
                name: name,
                hostIp: hostIp,
                port: parseInt(port),
                username: user,
                identityFile: this.resolveHome(identityFilePath)
            });
        }

        return [validHosts, invalidSSHHosts];
    }

    private getSSHHostConfigValue(matchingParameter: string, hostConfig: SSHHostConfig[]): string | undefined {
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