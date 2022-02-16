import yargs from 'yargs';

export type statusArgs = {targetType: string}

export function statusCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<statusArgs> {
    return yargs
        .option('targetType', {
            choices: ['kube', 'db', 'web', 'all'],
            nargs: 1,
            type: 'string',
            default: 'all',
            requiresArg: false,
        })
        .example('$0 status', 'Get the status for all currently running process')
        .example('$0 status web', 'Get the status for the web process');
}