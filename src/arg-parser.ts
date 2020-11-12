import minimist from "minimist";
import { TargetType } from "./types";


// need a command layer
// export interface CommandArgs

export interface CreateNewConnectionArgs
{
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
            targetType: (<any> TargetType)[args._[0]],
            targetId: args._[1],
            jwt: args._[2]
        }
    }
}