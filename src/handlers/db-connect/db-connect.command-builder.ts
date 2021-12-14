import yargs from 'yargs';

export type dbConnectArgs = {target: string} 

export function dbConnectCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<dbConnectArgs>
{
    return yargs
        .positional('target', {
            type: 'string',
        })
        .example('$0 db-connect test', 'SSM connect example, uniquely named ssm target');
}