import { CliActions, CliArgParser } from "./arg-parser";
import chalk from 'chalk';
import figlet from "figlet";
import { ConnectionService, SessionService } from "./http.service/http.service";
import { ShellTerminal } from "./terminal/terminal";
import Conf from 'conf';

// console.log('thoum: 1 cup cloves garlic, 2 teaspoons salt, 1/4 cup lemon juice, 1/4 cup water, 3 cups neutral oil');

console.log(
    chalk.magentaBright(
        figlet.textSync('clunk80 cli', { horizontalLayout: 'full' })
    )
);

const config = new Conf({
    projectName: 'clunk80-cli', // don't touch this    
    configName: 'dev', // you can set this to be prod, stage, dev, TODO: be able to switch on config with inquirer 
    schema: {
        serviceUrl: {
            type: 'string',
            format: 'uri',
            default: 'https://app.clunk80.com/',
        },
        apiSecret: {
            type: 'string'
        },
        firstTime: {
            type: 'boolean',
            default: true
        }
        // TODO whatever we need for oauth
    }
});

const run = async () => {   
    
    var parser = new CliArgParser();
    var args = parser.parseArgs();

    if(config.get('firstTime'))
    {
        console.log(chalk.yellow('Please make sure to inject your API key into index.js'));
    }

    if(args.action == CliActions.config)
    {
        // TODO: inquirer to set up config
        config.set('serviceUrl', 'https://webshell-development-vpc-0917-115500-nabeel.clunk80.com/');
        config.set('apiSecret', '======ADD CONFIG HERE======');
        config.set('firstTime', false);
        console.log('Config updated');
        console.log(`To check config: 'cat ${config.path}'`);
        return;
    }
    
    const serviceUrl = <string> config.get('serviceUrl');
    const apiSecret = <string> config.get('apiSecret');

    const sessionService = new SessionService(serviceUrl, apiSecret);
    const sessions = await sessionService.ListSessions();

    var cliSpace = sessions.sessions.filter(s => s.displayName === 'cli-space'); // TODO: cli-space name can be changed in config

    var cliSessionId: string;
    if(cliSpace.length === 0)
    {
        const resp =  await sessionService.CreateSession('cli-space');
        cliSessionId = resp;
    } else {
        // there should only be 1
        cliSessionId = cliSpace.pop().id;
    }

    const connectionService = new ConnectionService(serviceUrl, apiSecret);
    const connectionId = await connectionService.CreateConnection(args.targetType, args.targetId, cliSessionId);

    const queryString = `?connectionId=${connectionId}`;
    const connectionUrl = `${serviceUrl}api/v1/hub/ssh/${queryString}`;

    var terminal = new ShellTerminal(connectionUrl, apiSecret);
    terminal.start();

    // To get 'keypress' events you need the following lines
    // ref: https://nodejs.org/api/readline.html#readline_readline_emitkeypressevents_stream_interface
    const readline = require('readline');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'q') {
            // close the session
            connectionService.CloseConnection(connectionId).catch();
            terminal.dispose();
            process.exit();
        } else {
            terminal.writeString(str);
        }
    });
    console.log('CTRL+Q to exit clunk80');
};

run();