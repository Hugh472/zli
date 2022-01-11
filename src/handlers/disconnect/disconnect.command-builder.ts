import yargs from 'yargs';

export type disconnectArgs = {targetType: string}

export function disconnectCmdBuilder(yargs : yargs.Argv<{}>) : yargs.Argv<disconnectArgs> {
    return yargs
        .option('targetType', {
            choices: ['kube', 'db', 'web', 'all'],
            nargs: 1,
            type: 'string',
            default: 'all',
            requiresArg: false,
        })
        .example('$0 disconnect', 'Disconnect all local Zli Daemon')
        .example('$0 disconnect kube', 'Disconnect Kube local Zli Daemon');
}