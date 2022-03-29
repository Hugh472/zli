import { policyService, systemTestEnvId, systemTestEnvName, systemTestPolicyTemplate, systemTestUniqueId, testTargets, vtTestTargetsToRun } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { DbTargetService } from '..../../../http-services/db-target/db-target.http-service';
import got from 'got/dist/source';

import { configService, logger, loggerConfigService } from '../system-test';
import { DigitalOceanBZeroTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { WebTargetService } from '../../../http-services/web-target/web-target.http-service';
import { TestUtils } from '../utils/test-utils';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { Subject } from '../../../../webshell-common-ts/http/v2/policy/types/subject.types';

const { Client } = require('pg');

export const vtSuite = () => {
    describe('vt suite', () => {
        let testPassed = false;
        const testUtils = new TestUtils(configService, logger, loggerConfigService);

        const localDbPort = 6100;
        const localWebPort = 6200;

        // Set up the policy before all the tests
        beforeAll(async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            await policyService.AddProxyPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy'),
                subjects: [currentUser],
                groups: [],
                description: `Proxy policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: []
            });
        }, 15 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our proxy policy
            const proxyPolicies = await policyService.ListProxyPolicies();
            const proxyPolicy = proxyPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'proxy')
            );
            policyService.DeleteProxyPolicy(proxyPolicy.id);
        }, 15 * 1000);


        afterEach(async () => {
            // Always disconnect after each test
            await callZli(['disconnect']);

            // Check the daemon logs incase there is a test failure
            await testUtils.CheckDaemonLogs(testPassed, expect.getState().currentTestName);

            // Always make sure our ports are free, else throw an error
            await testUtils.CheckPort(localDbPort);
            await testUtils.CheckPort(localWebPort);

            // Reset test passed
            testPassed = false;
        });

        test.each(vtTestTargetsToRun)('db virtual target connect %p', async (testTarget) => {
            const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

            // Create a new db virtual target
            const dbTargetService: DbTargetService = new DbTargetService(configService, logger);
            const dbVtName = `${doTarget.bzeroTarget.name}-db-vt`;

            const createDbTargetResponse = await dbTargetService.CreateDbTarget({
                targetName: dbVtName,
                proxyTargetId: doTarget.bzeroTarget.id,
                remoteHost: 'localhost',
                remotePort: 5432,
                localHost: 'localhost',
                localPort: localDbPort,
                environmentName: systemTestEnvName
            });

            logger.info('Creating db target connection');

            // Start the connection to the db virtual target
            logger.info('Connecting to db target with psql');
            await callZli(['connect', dbVtName]);

            // Ensure the created and connected event exist
            expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', ConnectionEventType.Created));
            expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', ConnectionEventType.ClientConnect));


            // Attempt to make our PSQL connection and create a database
            const client = new Client({
                host: 'localhost',
                port: localDbPort,
                user: 'postgres',
                password: '',
            });

            // First make our connection
            try {
                await client.connect();
            } catch (error) {
                logger.error(`Error connecting to db: ${error.stack}`);
                throw error;
            }

            // Then attempt our query
            const PSQL_QUERY = 'CREATE DATABASE somedb';
            const runQuery = new Promise<void>(async (resolve, reject) => {
                await client.query(PSQL_QUERY)
                    .then((_: any) => {
                        resolve();
                    })
                    .catch((e: any) => {
                        logger.error(`Error running query ${PSQL_QUERY}. Error: ${e.stack}`);
                        reject();
                    });
            });

            await runQuery;
            client.end();

            // Disconnect
            await callZli(['disconnect', 'db']);

            // Ensure the disconnect and close event exist
            expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', ConnectionEventType.ClientDisconnect));
            expect(await testUtils.EnsureConnectionEventCreated(createDbTargetResponse.targetId, dbVtName, 'n/a', 'DB', ConnectionEventType.Closed));

            // Reset our testPassed flag
            testPassed = true;
        }, 60 * 1000);


        test.each(vtTestTargetsToRun)('web virtual target connect %p', async (testTarget) => {
            const webserverRemotePort = 8000;
            const doTarget = testTargets.get(testTarget) as DigitalOceanBZeroTarget;

            // Create a new db virtual target
            const webTargetService: WebTargetService = new WebTargetService(configService, logger);
            const webVtName = `${doTarget.bzeroTarget.name}-web-vt`;

            const createWebTargetResponse = await webTargetService.CreateWebTarget({
                targetName: webVtName,
                proxyTargetId: doTarget.bzeroTarget.id,
                remoteHost: 'http://localhost',
                remotePort: webserverRemotePort,
                localHost: 'localhost',
                localPort: localWebPort,
                environmentName: systemTestEnvName
            });

            logger.info('Creating web target connection');

            // Start the connection to the db virtual target
            await callZli(['connect', webVtName, '--openBrowser=false']);

            // Ensure the created and connected event exist
            expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', ConnectionEventType.Created));
            expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', ConnectionEventType.ClientConnect));

            logger.info('Sending http request to web connection');
            const testConnectionRequest = await got.get(`http://localhost:${localWebPort}/`, { throwHttpErrors: false, https: { rejectUnauthorized: false } });

            expect(testConnectionRequest.statusCode).toBe(200);

            // Disconnect
            await callZli(['disconnect', 'web']);

            // Ensure the disconnect and close event exist
            expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', ConnectionEventType.ClientDisconnect));
            expect(await testUtils.EnsureConnectionEventCreated(createWebTargetResponse.targetId, webVtName, 'n/a', 'WEB', ConnectionEventType.Closed));

            testPassed = true;
        }, 60 * 1000);
    });
};