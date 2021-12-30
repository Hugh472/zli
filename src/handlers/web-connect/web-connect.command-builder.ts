import yargs from 'yargs';

export type dbConnectArgs = {targetString: string} 

export function webConnectCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<dbConnectArgs>
{
    return yargs
        .positional('targetString', {
            type: 'string',
            default: null,
        })
        .example('$0 db-connect test', 'Db connect example, uniquely named web target');
}