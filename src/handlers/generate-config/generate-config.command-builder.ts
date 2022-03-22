import yargs from 'yargs';

export type generateConfigArgs = { typeOfConfig: string } &
{ clusterName: string } &
{ namespace: string } &
{ labels: string[] } &
{ customPort: number } &
{ outputFile: string } &
{ environmentName: string } &
{ update: boolean } &
{ mySshPath: string } &
{ bzSshPath: string }

export function generateConfigCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<generateConfigArgs> {
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
        }).option('labels', {
            type: 'array',
            default: [],
        }).option('customPort', {
            type: 'number',
            default: -1,
        }).option('outputFile', {
            type: 'string',
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
        .option('mySshPath', {
            type: 'string',
            default: null
        })
        .option('bzSshPath', {
            type: 'string',
            default: null
        })
        .example('$0 generate kubeYaml testcluster', '')
        .example('$0 generate kubeYaml --labels testkey:testvalue', '')
        .example('$0 generate kubeConfig', '')
        .example('$0 generate kubeConfig --update', `Update existing kube config (defaults KUBECONFIG to ${process.env.HOME}/.kube/config)`)
        .example('$0 generate sshConfig', 'Create and link an ssh config file based on your organization\'s policies')
        .example('$0 generate sshConfig --mySshPath path/to/config --bzSshPath path/to/bz-config', `Optionally specify filepaths (defaults to ${process.env.HOME}/.ssh/config and ${process.env.HOME}/.ssh/bz-config respectively)`);
}