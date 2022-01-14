import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { cleanExit } from '../clean-exit.handler';
import { getTableOfTargetGroups } from '../../utils/utils';
import yargs from 'yargs';
import { targetGroupArgs } from './target-group.command-builder';
import { PolicyHttpService } from '../../../src/http-services/policy/policy.http-services';

export async function listTargetGroupHandler(configService: ConfigService, logger: Logger, argv : yargs.Arguments<targetGroupArgs>, policyName: string) {

    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubernetesPolicies();
    const targetGroups : string[] = [];
    const kubePolicy = kubePolicies.find(p => p.name == policyName);
    if (kubePolicy) {
        kubePolicy.clusterGroups.forEach(
            u => targetGroups.push(u.name)
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