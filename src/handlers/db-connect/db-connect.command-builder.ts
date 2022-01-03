import yargs from 'yargs';

export type dbConnectArgs = {targetName: string} 

export function dbConnectCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<dbConnectArgs>
{
    return yargs
        .positional('targetName', {
            type: 'string',
            default: null,
        })
        .example('$0 db-connect grafana', 'db connect example, uniquely named db target');
}