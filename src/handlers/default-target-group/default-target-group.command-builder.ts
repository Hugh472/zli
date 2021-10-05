import yargs from 'yargs';

export type defaultTargetGroupArgs = { groups: string[] } &
    { view: boolean}

export function defaultTargetGroupCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<defaultTargetGroupArgs> {
    return yargs
        .option('groups',
            {
                type: 'array',
                alias: 'g',
                default: [],
                demandOption: true,
            }
        )
        .option('view',
            {
                type: 'boolean',
                alias: 'v',
                default: false,
                demandOption: false,
            }
        )
        .example('$0 default-targetGroup -g system:masters', 'Set default target group to system:masters')
        .example('$0 default-targetGroup', 'Set default target group back to none');
}