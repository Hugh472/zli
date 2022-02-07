import {
    findSubstring,
    getTableOfTargets,
    parseTargetType,
    parseTargetStatus
} from '../../utils/utils';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { includes, map, uniq } from 'lodash';
import { ConfigService } from '../../services/config/config.service';
import yargs from 'yargs';
import { listTargetsArgs } from './list-targets.command-builder';
import { listTargets } from '../../services/list-targets/list-targets.service';
import { EnvironmentHttpService } from '../../http-services/environment/environment.http-services';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/target.status';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';

export async function listTargetsHandler(
    configService: ConfigService,
    logger: Logger,
    argv: yargs.Arguments<listTargetsArgs>
) {
    let allTargets = await listTargets(configService, logger);

    const envHttpService = new EnvironmentHttpService(configService, logger);
    const envs = await envHttpService.ListEnvironments();

    // find all envIds with substring search
    // filter targets down by endIds
    // ref for '!!': https://stackoverflow.com/a/29312197/14782428
    if(!! argv.env) {
        const envIdFilter = envs.filter(e => findSubstring(argv.env, e.name)).map(e => e.id);
        allTargets = allTargets.filter(t => envIdFilter.includes(t.environmentId));
    }

    // filter targets by name/alias
    if(!! argv.name) {
        allTargets = allTargets.filter(t => findSubstring(argv.name, t.name));
    }

    // filter targets by TargetType
    if(!! argv.targetType) {
        const targetType = parseTargetType(argv.targetType);
        allTargets = allTargets.filter(t => t.type === targetType);
    }

    if(!! argv.status) {
        const statusArray: string[] = argv.status;

        let targetStatusFilter: TargetStatus[] = map(statusArray, (s: string) => parseTargetStatus(s)).filter(s => s); // filters out undefined
        targetStatusFilter = uniq(targetStatusFilter);

        allTargets = allTargets.filter(t => (t.type != TargetType.SsmTarget && t.type != TargetType.Cluster) || includes(targetStatusFilter, t.status));
    }

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(allTargets));
    } else {
        // regular table output
        // We OR the detail and status flags since we want to show the details in both cases
        const tableString = getTableOfTargets(allTargets, envs, !! argv.detail || !! argv.status, !! argv.showId);
        console.log(tableString);
    }

    await cleanExit(0, logger);
}