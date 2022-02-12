import { testTargets, vtTestTargetsToRun } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { DbTargetService } from '..../../../http-services/db-target/db-target.http-service';
import got from 'got/dist/source';

import { configService, logger } from '../system-test';
import { DigitalOceanBZeroTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { WebTargetService } from '../../../http-services/web-target/web-target.http-service';

const pgtools = require('pgtools');

export const vtSuite = () => {
    describe('vt suite', () => {

        afterEach(async () => {
            // Always disconnect after each test
            await callZli(['disconnect']);
        });

        test.each(vtTestTargetsToRun)('db virtual target connect %p', async (testTarget) => {
            const localDbPort = 6100;
            const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

            // Create a new db virtual target
            const dbTargetService: DbTargetService = new DbTargetService(configService, logger);
            const dbVtName = `${doTarget.bzeroTarget.name}-db-vt`;

            await dbTargetService.CreateDbTarget({
                targetName: dbVtName,
                bzeroAgentId: doTarget.bzeroTarget.id,
                remoteHost: 'localhost',
                remotePort: 5432,
                localHost: 'localhost',
                localPort: localDbPort,
                environmentName: 'Default'
            });

            logger.info('Creating db target connection');

            // Start the connection to the db virtual target
            await callZli(['connect', dbVtName]);

            logger.info('Connecting to db target with psql');

            const credentials = {
                user: 'postgres',
                host: 'localhost',
                password: '',
                port: localDbPort,
            };

            await pgtools.createdb(credentials, 'some_db');

        }, 120 * 1000);


        test.each(vtTestTargetsToRun)('web virtual target connect %p', async (testTarget) => {
            const localWebPort = 6200;
            const webserverRemotePort = 8000;
            const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

            // Create a new db virtual target
            const webTargetService: WebTargetService = new WebTargetService(configService, logger);
            const webVtName = `${doTarget.bzeroTarget.name}-web-vt`;

            await webTargetService.CreateWebTarget({
                targetName: webVtName,
                bzeroAgentId: doTarget.bzeroTarget.id,
                remoteHost: 'http://localhost',
                remotePort: webserverRemotePort,
                localHost: 'localhost',
                localPort: localWebPort,
                environmentName: 'Default'
            });

            logger.info('Creating web target connection');

            // Start the connection to the db virtual target
            await callZli(['connect', webVtName, '--openBrowser=false']);

            logger.info('Sending http request to web connection');

            const testConnectionRequest = await got.get(`http://localhost:${localWebPort}/`, { throwHttpErrors: false, https: { rejectUnauthorized: false } });

            expect(testConnectionRequest.statusCode).toBe(200);

        }, 120 * 1000);
    });
};