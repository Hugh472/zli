import yargs from 'yargs';

export type generateKubeArgs = {clusterName: string} &
{namespace: string} &
{labels: string[]} &
{customPort: number} &
{outputFile: string} &
{environmentName: string } &
{update: boolean}

function generateKubeCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeArgs> {
    return yargs
        .positional('clusterName', {
            type: 'string',
            default: null
        }).option('namespace', {
            type: 'string',
            default: '',
            demandOption: false
        }).option('labels', {
            type: 'array',
            default: [],
            demandOption: false
        }).option('customPort', {
            type: 'number',
            default: -1,
            demandOption: false
        }).option('outputFile', {
            type: 'string',
            demandOption: false,
            alias: 'o',
            default: null
        })
        .option('environmentName', {
            type: 'string',
            default: null
        })
        .option('update', {
            type: 'boolean',
            default: false
        });

}

export function generateKubeYamlCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeArgs> {
    return generateKubeCmdBuilder(yargs)
        .example('$0 generate kubeYaml testcluster', '')
        .example('$0 generate kubeYaml --labels testkey:testvalue', '');
}

export function generateKubeConfigCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeArgs> {
    return generateKubeCmdBuilder(yargs)
        .example('$0 generate kubeConfig', '')
        .example('$0 generate kubeConfig --update', 'Update existing kube config (defaults KUBECONFIG to $HOME/.kube/config)');
}