import yargs from 'yargs';

type describeClusterPolicyArgs = {clusterName : string};

export function describeClusterPolicyCmdBuilder(yargs: yargs.Argv<{}>) : yargs.Argv<describeClusterPolicyArgs> {
    return yargs
        .positional('clusterName', {
            type: 'string',
        })
        .example('$0 describe-cluster test-cluster', '');
}