import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { bzeroTargetToTargetSummary, getTableOfConnections, ssmTargetToTargetSummary } from '../../utils/utils';
import { cleanExit } from '../clean-exit.handler';
import { getCliSpace } from '../../utils/shell-utils';
import { listConnectionsArgs } from './list-connections.command-builder';
import { SpaceHttpService } from '../../http-services/space/space.http-services';
import { ConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/connection-summary.types';
import { ConnectionState } from '../../../webshell-common-ts/http/v2/connection/types/connection-state.types';
import yargs from 'yargs';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { BzeroAgentService } from '../../http-services/bzero-agent/bzero-agent.http-service';

export async function listConnectionsHandler(
    argv: yargs.Arguments<listConnectionsArgs>,
    configService: ConfigService,
    logger: Logger
){
    const spaceHttpService = new SpaceHttpService(configService, logger);
    const cliSpace = await getCliSpace(spaceHttpService, logger);

    if (cliSpace == undefined) {
        logger.warn('You have not opened any zli connections.');
        await cleanExit(0, logger);
    }

    const openConnections = cliSpace.connections.filter(c => c.state === ConnectionState.Open);

    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const ssmTargets = await ssmTargetHttpService.ListSsmTargets(true);

    const bzeroAgentService = new BzeroAgentService(configService, logger);
    const bzeroTargets = await bzeroAgentService.ListBzeroAgents();

    const allTargets = [...ssmTargets.map(ssmTargetToTargetSummary), ...bzeroTargets.map(bzeroTargetToTargetSummary)];

    const formattedConnections = openConnections.map<ConnectionSummary>((conn, _index, _array) => {
        return {
            id: conn.id,
            timeCreated: conn.timeCreated,
            targetId: conn.targetId,
            spaceId: conn.spaceId,
            state: conn.state,
            targetType: conn.targetType,
            targetUser: conn.targetUser,
            sessionRecordingAvailable: conn.sessionRecordingAvailable,
            sessionRecording: conn.sessionRecording,
            inputRecording: conn.inputRecording,
            subjectId: conn.subjectId
        };
    });

    if(!! argv.json) {
        // json output
        console.log(JSON.stringify(formattedConnections));
    } else {
        if (formattedConnections.length === 0){
            logger.info('There are no open zli connections');
            await cleanExit(0, logger);
        }
        // regular table output
        const tableString = getTableOfConnections(formattedConnections, allTargets);
        console.log(tableString);
    }

    await cleanExit(0, logger);
}