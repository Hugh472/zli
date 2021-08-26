import yargs from "yargs"
import os from 'os';

export type quickstartArgs = { sshConfigFile: string } &
{ showParseErrors: boolean }

export function quickstartCmdBuilder(yargs: yargs.Argv<{}>): yargs.Argv<quickstartArgs> {
    return yargs
        .option(
            'sshConfigFile',
            {
                type: 'string',
                demandOption: false,
                alias: 'c',
                describe: 'Path to ssh config file',
                default: `${os.homedir()}/.ssh/config`
            }
        )
        .option(
            'showParseErrors',
            {
                type: 'boolean',
                demandOption: false,
                alias: 'e',
                describe: 'Display information on invalid SSH hosts',
                default: false
            }
        )
}