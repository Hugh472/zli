import { CliArgParser } from "./arg-parser";
import chalk from 'chalk';
import figlet from "figlet";
import { HttpService } from "./http.service/http.service";
import { CreateConnectionRequest, CreateConnectionResponse, CreateSessionRequest, CreateSessionResponse } from "./http.service/http.service.types";
import { time } from "console";

// console.log('1 cup cloves garlic, 2 teaspoons salt, 1/4 cup lemon juice, 1/4 cup water, 3 cups neutral oil');

console.log(
    chalk.magentaBright(
      figlet.textSync('clunk80 cli', { horizontalLayout: 'full' })
    )
  );





const run = async () => {
    
    var parser = new CliArgParser();
    var args = parser.parseArgs();

    var httpService = new HttpService(args.jwt);

    var newSessionRequest : CreateSessionRequest = {
        displayName: `cli-space-${Math.round(new Date().getTime() / 1000)}`,
        connectionsToOpen: []
    };

    const newSessionResponse = await httpService.Post<CreateSessionRequest, CreateSessionResponse>('api/v1/session/create', newSessionRequest);

    var newConnectionRequest : CreateConnectionRequest = {
        serverId: args.targetId,
        serverType: args.targetType,
        sessionId: newSessionResponse.sessionId
    };

    const newConnectionResponse = await httpService.Post<CreateConnectionRequest, CreateConnectionResponse>('api/v1/connection/create', newConnectionRequest);

    // feed into signal R
};

run();