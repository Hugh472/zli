import yargs from 'yargs';

export type generateConfigArgs = { typeOfConfig: string } &
{ clusterName: string } &
{ namespace: string } &
{ labels: string[] } &
{ customPort: number } &
{ outputFile: string } &
{ environmentName: string } &
{ update: boolean }

export function generateConfigCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<generateKubeArgs> {
    return yargs
        .positional('typeOfConfig', {
            type: 'string',
            choices: ['kubeConfig', 'kubeYaml', 'sshConfig']

        }).positional('clusterName', {
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
        })
        .example('$0 generate kubeYaml testcluster', '')
        .example('$0 generate kubeYaml --labels testkey:testvalue', '')
        .example('$0 generate kubeConfig', '')
        .example('$0 generate kubeConfig --update', 'Update existing kube config (defaults KUBECONFIG to $HOME/.kube/config)')
        .example('$0 generate sshConfig', 'Create and link an ssh config file based on your organization\'s policies');
}