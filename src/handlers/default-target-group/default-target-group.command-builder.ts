import yargs from 'yargs';

export type defaultTargetGroupArgs = { set: string[] }

export function defaultTargetGroupCmdBuilder(yargs: yargs.Argv<{}>) :
yargs.Argv<defaultTargetGroupArgs> {
    return yargs
        .option('set',
            {
                type: 'array',
                default: [],
            }
        )
        .example('$0 default-targetGroup --set system:masters', 'Set default target group to system:masters')
        .example('$0 default-targetGroup --set', 'Reset default target group to empty')
        .example('$0 default-targetGroup', 'View default target group');
}