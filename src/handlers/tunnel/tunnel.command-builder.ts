import yargs from 'yargs';

export type tunnelArgs = {tunnelString: string} & {customPort: number} & {targetGroup: string[]}

export function tunnelCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<tunnelArgs> {
    return yargs
        .positional('tunnelString', {
            type: 'string',
            default: null,
            demandOption: false,
        }).option('customPort', {
            type: 'number',
            default: -1,
            demandOption: false
        }).option('targetGroup', {
            type: 'array',
            default: [],
            demandOption: false
        })
        .example('$0 tunnel admin@neat-cluster', 'Connect to neat-cluster as the admin Kube RBAC user')
        .example('$0 tunnel admin@neat-cluster --targetGroup system:master', 'Connect to neat-cluster as the admin Kube RBAC user in the system:master group');
}