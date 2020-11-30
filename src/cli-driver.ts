import { SessionState, TargetType } from "./types";
import { findSubstring } from './utils';
import yargs from "yargs";
import { ConfigService } from "./config.service/config.service";
import { ConnectionService, EnvironmentsService, SessionService, SshTargetService, SsmTargetService } from "./http.service/http.service";
import { OAuthService } from "./oauth.service/oauth.service";
import { ShellTerminal } from "./terminal/terminal";
import chalk from "chalk";
import Table from 'cli-table3';
import termsize from 'term-size';
import { UserinfoResponse } from "openid-client";
import { MixpanelService } from "./mixpanel.service/mixpanel.service";
import { checkVersionMiddleware } from "./middlewares/check-version-middleware";
import { oauthMiddleware } from "./middlewares/oauth-middleware";


export function thoumMessage(message: string): void
{
    console.log(chalk.magenta(`thoum >>> ${message}`));
}

export function thoumWarn(message: string): void
{
    console.log(chalk.yellowBright(`thoum >>> ${message}`));
}

export function  thoumError(message: string): void
{
    console.log(chalk.red(`thoum >>> ${message}`));
}

export class CliDriver
{
    private configService: ConfigService;
    private userInfo: UserinfoResponse; // sub and email

    private mixpanelService: MixpanelService;

    public start()
    {
        yargs(process.argv.slice(2))
        .scriptName("thoum")
        .usage('$0 <cmd> [args]')
        .wrap(null)
        .middleware(checkVersionMiddleware)
        .middleware((argv) =>
        {
            // Config init
            this.configService = new ConfigService(<string> argv.configName);
        })
        .middleware(async () => {
            // OAuth
            this.userInfo = await oauthMiddleware(this.configService);
            thoumMessage(`Logged in as: ${this.userInfo.email}, clunk80-id:${this.userInfo.sub}`);
        })
        .middleware(async (argv) => {
            // Mixpanel tracking
            this.mixpanelService = new MixpanelService(
                this.configService.mixpanelToken(),
                this.userInfo.sub
            );

            // Only captures args, not options at the moment. Capturing configName flag
            // does not matter as that is handled by which mixpanel token is used
            // TODO: capture options and flags
            this.mixpanelService.TrackCliCall('CliCommand', { args: argv._ } );
        })
        // TODO: https://github.com/yargs/yargs/blob/master/docs/advanced.md#commanddirdirectory-opts
        // <requiredPositional>, [optionalPositional]
        .command(
            'connect <targetType> <targetId> [targetUser]',
            'Connect to a target, targetUser only required for SSM targets',
            (yargs) => {
                // you must return the yarg for the handler to have types
                return yargs.positional('targetType', {
                    type: 'string',
                    describe: 'ssm or ssh',
                    choices: ['ssm', 'ssh'],
                }).positional('targetId', {
                    type: 'string',
                    describe: 'GUID of target',
                }).positional('targetUser', {
                    type: 'string',
                    describe: 'User on target to assume for SSM',
                }).check((argv, opts) => {
                    if(argv.targetType === "ssm" && ! argv.targetUser)
                    {
                        thoumError('targetUser must be set for SSM');
                        return false;
                    }
                    if(argv.targetType === "ssh" && argv.targetUser) {
                        thoumMessage('targetUser cannot be set for SSH, ignoring');
                    }
                    return true;
                });
            },
            async (argv) => {
                // call list session
                const sessionService = new SessionService(this.configService);
                const listSessions = await sessionService.ListSessions();

                // space names are not unique, make sure to find the latest active one
                var cliSpace = listSessions.sessions.filter(s => s.displayName === 'cli-space' && s.state == SessionState.Active); // TODO: cli-space name can be changed in config

                // maybe make a session
                var cliSessionId: string;
                if(cliSpace.length === 0)
                {
                    cliSessionId =  await sessionService.CreateSession('cli-space');
                } else {
                    // there should only be 1 active 'cli-space' session
                    cliSessionId = cliSpace.pop().id;
                }

                const targetType = <TargetType> argv.targetType;
                const targetId = argv.targetId;
                // We do the following for ssh since we are required to pass
                // in a user although it does not get read at any point
                // TODO: fix how enums are parsed and compared
                const targetUser = argv.targetType === "ssh" ? "totally-a-user" : argv.targetUser;

                // make a new connection
                const connectionService = new ConnectionService(this.configService);
                const connectionId = await connectionService.CreateConnection(targetType, targetId, cliSessionId, targetUser);

                this.mixpanelService.TrackNewConnection(targetType);

                // run terminal
                const queryString = `?connectionId=${connectionId}`;
                const connectionUrl = `${this.configService.serviceUrl()}api/v1/hub/ssh/${queryString}`;

                var terminal = new ShellTerminal(this.configService, connectionUrl);
                terminal.start(termsize());

                // Terminal resize event logic
                // https://nodejs.org/api/process.html#process_signal_events -> SIGWINCH
                // https://github.com/nodejs/node/issues/16194
                // https://nodejs.org/api/process.html#process_a_note_on_process_i_o
                process.stdout.on('resize', () =>
                {
                    const resizeEvent = termsize();
                    terminal.resize(resizeEvent);
                });

                // To get 'keypress' events you need the following lines
                // ref: https://nodejs.org/api/readline.html#readline_readline_emitkeypressevents_stream_interface
                const readline = require('readline');
                readline.emitKeypressEvents(process.stdin);
                process.stdin.setRawMode(true);
                process.stdin.on('keypress', async (str, key) => {
                    if (key.ctrl && key.name === 'p') {
                        // close the session
                        await connectionService.CloseConnection(connectionId).catch();
                        terminal.dispose();
                        process.exit(0);
                    } else {
                        terminal.writeString(key.sequence);
                    }
                });
                thoumMessage('CTRL+P to exit thoum');
            }
        )
        .command(
            ['list-targets', 'lt'],
            'List all SSM and SSH targets',
            (yargs) => {
                return yargs
                .option(
                    'targetType', 
                    { 
                        type: 'string', 
                        choices: ['ssm', 'ssh'],
                        demandOption: false,
                        alias: 't'
                    },
                )
                .option(
                    'env',
                    {
                        type: 'string',
                        demandOption: false,
                        alias: 'e'
                    }
                )
                .option(
                    'name',
                    {
                        type: 'string',
                        demandOption: false,
                        alias: 'n'
                    }
                )
            },
            async (argv) => {
                const ssmTargetService = new SsmTargetService(this.configService);
                let ssmList = await ssmTargetService.ListSsmTargets();

                const sshTargetService = new SshTargetService(this.configService);
                let sshList = await sshTargetService.ListSsmTargets();

                const envService = new EnvironmentsService(this.configService);
                const envs = await envService.ListEnvironments();

                // ref: https://github.com/cli-table/cli-table3
                var table = new Table({
                    head: ['Type', 'Name', 'Environment', 'Id']
                , colWidths: [6, 16, 16, 38]
                });

                
                // find all envIds with substring search
                // filter targets down by endIds
                if(argv.env)
                {
                    const envIdFilter = envs.filter(e => findSubstring(argv.env, e.name)).map(e => e.id);

                    ssmList = ssmList.filter(ssm => envIdFilter.includes(ssm.environmentId));
                    sshList = sshList.filter(ssh => envIdFilter.includes(ssh.environmentId));
                }

                // filter targets by name/alias
                if(argv.name)
                {   
                    ssmList = ssmList.filter(ssm => findSubstring(argv.name, ssm.name));
                    sshList = sshList.filter(ssh => findSubstring(argv.name, ssh.alias));
                }

                // push targets to printed table, maybe filter by targetType
                if(argv.targetType === 'ssm')
                {
                    ssmList.forEach(ssm => table.push(['ssm', ssm.name, envs.filter(e => e.id == ssm.environmentId).pop().name, ssm.id]));
                } else if(argv.targetType === 'ssh') {
                    sshList.forEach(ssh => table.push(['ssh', ssh.alias, envs.filter(e => e.id == ssh.environmentId).pop().name, ssh.id]));
                } else {
                    ssmList.forEach(ssm => table.push(['ssm', ssm.name, envs.filter(e => e.id == ssm.environmentId).pop().name, ssm.id]));
                    sshList.forEach(ssh => table.push(['ssh', ssh.alias, envs.filter(e => e.id == ssh.environmentId).pop().name, ssh.id]));
                }

                const tableString = table.toString(); // hangs if you try to print directly to console
                console.log(tableString);
                process.exit(0);
            }
        )
        .command(
            'config',
            'Returns config file path',
            () => {},
            () => {
                thoumMessage(`You can edit your config here: ${this.configService.configPath()}`);
                process.exit(0);
            }
        ).command(
            'logout',
            'Deauthenticate the client',
            () => {},
            async () => {
                var ouath = new OAuthService(this.configService.authUrl(), this.configService.callbackListenerPort());
                await ouath.logout(this.configService.tokenSet());
                this.configService.logout();
                process.exit(0);
            }
        )
        .option('configName', {type: 'string', choices: ['prod', 'stage', 'dev'], default: 'prod', hidden: true})
        .strict() // if unknown command, show help
        .demandCommand() // if no command, show help
        .help() // auto gen help message
        .argv; // returns argv of yargs
    }
}