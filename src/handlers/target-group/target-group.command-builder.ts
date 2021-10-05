import yargs from 'yargs';

export type targetGroupArgs = {add: boolean} &
{delete: boolean} &
{group: string} &
{policyName: string} &
{json: boolean}

export function targetGroupCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<targetGroupArgs> {
    return yargs
        .option(
            'add',
            {
                type: 'boolean',
                demandOption: false,
                alias: 'a',
                implies: ['group', 'policyName']
            }
        )
        .option(
            'delete',
            {
                type: 'boolean',
                demandOption: false,
                alias: 'd',
                implies: ['group', 'policyName']
            }
        )
        .conflicts('add', 'delete')
        .positional('group',
            {
                type: 'string',
                default: null,
                demandOption: false,
            }
        )
        .positional('policyName',
            {
                type: 'string',
                default: null,
                demandOption: true,
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
        .example('$0 targetGroup --json', 'List all target users, output as json, pipeable')
        .example('$0 targetGroup --add cool-policy system:masters', 'Adds the system:master group to cool-policy')
        .example('$0 targetGroup -d test-cluster system:masters', 'Removes the system:masters group from the test-cluster policy');
}