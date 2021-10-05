import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfTargetGroups } from '../../utils';
import { PolicyService } from '../../services/policy/policy.service';
import { PolicyType, KubernetesPolicyContext } from '../../services/policy/policy.types';
import yargs from 'yargs';
import { targetGroupArgs } from './target-group.command-builder';

export async function listTargetGroupHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<targetGroupArgs>, policyName: string) {

    const policyService = new PolicyService(configService, logger);
    const policies = await policyService.ListAllPolicies();
    const targetGroups : string[] = [];
    const policy = policies.find(p => p.name == policyName);
    if (policy != null && policy.type == PolicyType.KubernetesTunnel) {
        const kubernetesPolicyContext = policy.context as KubernetesPolicyContext;
        Object.values(kubernetesPolicyContext.clusterGroups).forEach(
            clusterGroup => targetGroups.push(clusterGroup.name)
        );
    }

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(targetGroups));
    } else {
        if (targetGroups.length === 0){
            logger.info('There are no available target groups');
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfTargetGroups(targetGroups);
        console.log(tableString);
    }
}