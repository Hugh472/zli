import yargs from 'yargs';

const targetNameSchemes = ['do', 'aws', 'time', 'hostname'] as const;
export type TargetNameScheme = typeof targetNameSchemes[number];

const operatingSystems = ['centos', 'ubuntu', 'universal'] as const;
export type OperatingSystem = typeof operatingSystems[number];

export type generateBashArgs = { environment: string } &
{ targetNameScheme: TargetNameScheme } &
{ agentVersion: string } &
{ outputFile: string }

export function generateBashCmdBuilder(processArgs : string[], yargs: yargs.Argv<{}>): yargs.Argv<generateBashArgs> {
    return yargs
        .option(
            'environment',
            {
                type: 'string',
                demandOption: false,
                alias: 'e',
                default: 'Default',
                describe: 'Specifies the target\'s environment',
            }
        )
        .option(
            'targetNameScheme',
            {
                demandOption: false,
                choices: targetNameSchemes,
                default: 'hostname' as TargetNameScheme,
                conflicts: 'targetName',
                describe: 'Configures the target name. Defaults to using the hostname of the target.',
            }
        )
        .option(
            'agentVersion',
            {
                type: 'string',
                demandOption: false,
                default: 'latest',
                describe: 'Use a specific version of the agent',
            }
        )
        .option(
            'outputFile',
            {
                type: 'string',
                demandOption: false,
                alias: 'o',
                describe: 'Write the script to a file'
            }
        )
        .example('generate-bash --targetNameScheme time', '')
        .example('generate-bash -o script.sh', 'Writes the script to a file "script.sh" in the current directory');
}