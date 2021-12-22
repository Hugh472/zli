import yargs from 'yargs';

const policyTypes = ['targetconnect', 'organizationcontrols', 'sessionrecording', 'kubernetestunnel'] as const;
export type PolicyType = typeof policyTypes[number];

export type policyArgs = {type: PolicyType} & {json: boolean}

export function policyCmdBuilder (yargs : yargs.Argv<{}>) : yargs.Argv<policyArgs> {
    return yargs
        .option(
            'type',
            {
                choices: policyTypes,
                alias: 't',
                demandOption: false
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
        .example('$0 policy --json', 'List all policies, output as json, pipeable');
}