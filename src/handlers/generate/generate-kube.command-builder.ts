import yargs from 'yargs';

export type generateKubeArgs = {outputFile: string}

function generateKubeCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeArgs> {
    return yargs
        .option('outputFile', {
            type: 'string',
            demandOption: false,
            alias: 'o',
            default: null
        })
}

export type generateKubeYamlArgs = generateKubeArgs
& {labels: string[]}
& {namespace: string}
& {environmentName: string }
& {clusterName: string}

export function generateKubeYamlCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeYamlArgs> {
    return generateKubeCmdBuilder(yargs)
        .positional('clusterName', {
            type: 'string',
            default: null
        })
        .option('namespace', {
            type: 'string',
            default: '',
            demandOption: false
        })
        .option('labels', {
            type: 'array',
            default: [],
            demandOption: false
        })
        .option('environmentName', {
            type: 'string',
            default: null
        })
        .example('$0 generate kubeYaml testcluster', '')
        .example('$0 generate kubeYaml --labels testkey:testvalue', '');
}

export type generateKubeConfigArgs = generateKubeArgs
& {customPort: number}
& {update: boolean}

export function generateKubeConfigCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateKubeConfigArgs> {
    return generateKubeCmdBuilder(yargs)
        .option('update', {
            type: 'boolean',
            default: false
        })
        .option('customPort', {
            type: 'number',
            default: -1,
            demandOption: false
        })
        .example('$0 generate kubeConfig', '')
        .example('$0 generate kubeConfig --update', 'Update existing kube config (defaults KUBECONFIG to $HOME/.kube/config)');
}