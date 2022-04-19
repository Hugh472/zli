import yargs from 'yargs';

export type listTargetsArgs =
{user: string} &
{targetType: string[]} &
{env: string} &
{name: string} &
{status: string[]} &
{detail: boolean} &
{showId: boolean} &
{json: boolean}

export function listTargetsCmdBuilder(yargs: yargs.Argv<{}>, targetTypeChoices: string[], targetStatusChoices: string[]) : yargs.Argv<listTargetsArgs> {
    return yargs
        .options(
            'user',
            {
                type: 'string',
                demandOption: false,
                alias: 'u',
                requiresArg: true,
                description: 'User email address to filter targets based on target access policies. [Admin only]'
            }
        )
        .option(
            'targetType',
            {
                type: 'string',
                array: true,
                choices: targetTypeChoices,
                demandOption: false,
                alias: 't',
                requiresArg: true,
                description: 'Filter results based on target type.'
            }
        )
        .option(
            'env',
            {
                type: 'string',
                demandOption: false,
                alias: 'e',
                requiresArg: true,
                description: 'Filter results based on environment name of the target.'
            }
        )
        .option(
            'name',
            {
                type: 'string',
                demandOption: false,
                alias: 'n',
                requiresArg: true,
                description: 'Filter results based on target name (substring match).'
            }
        )
        .option(
            'status',
            {
                type: 'string',
                array: true,
                choices: targetStatusChoices,
                requiresArg: true,
                description: 'Filter results based on target status'
            }
        )
        .option(
            'detail',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'd'
            }
        )
        .option(
            'showId',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'i'
            }
        )
        .option(
            'json',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'j',
            }
        )
        .option(
            'verbose',
            {
                type: 'boolean',
                default: false,
                demandOption: false,
                alias: 'v',
            }
        )
        .example('$0 lt -t ssm', 'List all SSM targets only')
        .example('$0 lt -i', 'List all targets and show unique ids')
        .example('$0 lt -e prod --json --silent', 'List all targets targets in prod, output as json, pipeable');
}