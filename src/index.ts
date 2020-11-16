import { CliActions, CliArgParser } from "./arg-parser";
import chalk from 'chalk';
import figlet from "figlet";
import { HttpService } from "./http.service/http.service";
import { CloseSessionRequest, CloseSessionResponse, CreateConnectionRequest, CreateConnectionResponse, CreateSessionRequest, CreateSessionResponse } from "./http.service/http.service.types";
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
        // exit
        config.set('serviceUrl', 'https://webshell-development-vpc-0917-115500-nabeel.clunk80.com/');
        config.set('apiSecret', '======ADD CONFIG HERE======');
        config.set('firstTime', false);
        console.log('Config updated');
        console.log(`To check config: 'cat ${config.path}'`);
        return;
    }
    
    const serviceUrl = <string> config.get('serviceUrl');
    const apiSecret = <string> config.get('apiSecret');
    var httpService = new HttpService(serviceUrl, apiSecret);

    var newSessionRequest : CreateSessionRequest = {
        displayName: 'cli-space',
        connectionsToOpen: []
    };

    const newSessionResponse = await httpService.Post<CreateSessionRequest, CreateSessionResponse>('api/v1/session/create', newSessionRequest);

    var newConnectionRequest : CreateConnectionRequest = {
        serverId: args.targetId,
        serverType: args.targetType,
        sessionId: newSessionResponse.sessionId
    };

    const newConnectionResponse = await httpService.Post<CreateConnectionRequest, CreateConnectionResponse>('api/v1/connection/create', newConnectionRequest);

    const queryString = `?connectionId=${newConnectionResponse.connectionId}`;
    const connectionUrl = `${serviceUrl}api/v1/hub/ssh/${queryString}`;

    var terminal = new ShellTerminal(connectionUrl, apiSecret);
    terminal.start();

    // To get 'keypress' events you need the following lines
    // ref: https://nodejs.org/api/readline.html#readline_readline_emitkeypressevents_stream_interface
    const readline = require('readline');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            // close the session
            httpService.Post<CloseSessionRequest, CloseSessionResponse>('api/v1/connection/close', {sessionId: newSessionResponse.sessionId}).catch();
            terminal.dispose();
            process.exit();
        } else {
            terminal.writeString(str);
        }
    });
    console.log('CTRL+Q to exit clunk80');
};

run();