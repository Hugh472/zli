import yargs from 'yargs';

export type generateSshArgs = { mySshPath: string } &
{ bzSshPath: string }

export function generateSshCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<generateSshArgs> {
    return yargs
        .option('mySshPath', {
            type: 'string',
            default: null
        })
        .option('bzSshPath', {
            type: 'string',
            default: null
        })
        .example('$0 generate sshConfig', 'Create and link an ssh config file based on your organization\'s policies')
        .example('$0 generate sshConfig --mySshPath path/to/config --bzSshPath path/to/bz-config', `Optionally specify filepaths (defaults to ${process.env.HOME}/.ssh/config and ${process.env.HOME}/.ssh/bz-config respectively)`);
}