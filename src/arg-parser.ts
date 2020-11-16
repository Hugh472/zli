import minimist from "minimist";
import { TargetType } from "./types";


export enum CliActions
{
    config = 'config',
    connect = 'connect',
    help = 'help'
}

// need a command layer
// export interface CommandArgs

export interface CreateNewConnectionArgs
{
    action: CliActions;
    targetType: TargetType;
    targetId: string;
    jwt: string;
}

export class CliArgParser
{
    public parseArgs() : CreateNewConnectionArgs
    {
        const args = minimist(process.argv.slice(2));

        return {
            action: (<any> CliActions)[args._[0]],
            targetType: (<any> TargetType)[args._[1]],
            targetId: args._[2],
            jwt: args._[3]
        }
    }
}