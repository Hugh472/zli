import { ConfigService } from '../services/config/config.service';
import { DbTargetService } from '../http-services/db-target/db-target.http-service';
import { Logger } from '../services/logger/logger.service';
import { DbTargetSummary } from '../../webshell-common-ts/http/v2/target/db/types/db-target-summary.types';
import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';
import { WebTargetService } from '../http-services/web-target/web-target.http-service';
import { WebTargetSummary } from '../../webshell-common-ts/http/v2/target/web/web-target-summary.types';

export async function listDbTargets(logger: Logger, configService: ConfigService): Promise<DbTargetSummary[]> {
    const dbTargetService = new DbTargetService(configService, logger);

    const dbTargets = new Promise<DbTargetSummary[]>( async (res) => {
        try {
            const response = await dbTargetService.ListDbTargets();
            const results = response.map<DbTargetSummary>((target, _index, _array) => {
                return { type: TargetType.Db, id: target.id, name: target.name, status: target.status, localPort: target.localPort, agentVersion: target.agentVersion, lastAgentUpdate: target.lastAgentUpdate, engine: target.engine, remotePort: target.remotePort, remoteHost: target.remoteHost, environmentId: target.environmentId, localHost: target.localHost, region: target.region };
            });

            res(results);
        } catch (e: any) {
            logger.error(`Failed to fetch db targets: ${e}`);
            res([]);
        }
    });

    return dbTargets;
}

export async function listWebTargets(logger: Logger, configService: ConfigService): Promise<WebTargetSummary[]> {
    const webTargetService = new WebTargetService(configService, logger);

    const webTargets = new Promise<WebTargetSummary[]>( async (res) => {
        try {
            const response = await webTargetService.ListWebTargets();
            const results = response.map<WebTargetSummary>((target, _index, _array) => {
                return { type: TargetType.Web, id: target.id, name: target.name, status: target.status, agentVersion: target.agentVersion, lastAgentUpdate: target.lastAgentUpdate, remotePort: target.remotePort, remoteHost: target.remoteHost, environmentId: target.environmentId , localPort: target.localPort, localHost: target.localHost, region: target.region };
            });

            res(results);
        } catch (e: any) {
            logger.error(`Failed to fetch web targets: ${e}`);
            res([]);
        }
    });

    return webTargets;
}