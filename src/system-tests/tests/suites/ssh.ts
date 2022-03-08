import os from 'os';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services'
import { MockSTDIN, stdin } from 'mock-stdin';
import { configService, logger, loggerConfigService, policyService, ssmTestTargetsToRun, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { removeIfExists } from '../../../utils/utils';
import { VerbType } from '../../../../src/services/v1/policy-query/policy-query.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../../src/services/v1/policy/policy.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';

export const sshSuite = () => {
    describe('connect suite', () => {
        let mockStdin: MockSTDIN;
        const targetUser = 'ssm-user';
        const testUtils = new TestUtils(configService, logger, loggerConfigService);
        const enterKey = '\x0D';

        const userConfigFile = path.join(
            os.homedir(), '.ssh', 'test-config-user'
        );

        const bzConfigFile = path.join(
            os.homedir(), '.ssh', 'test-config-bz'
        );

        // Set up the policy before all the tests
        beforeAll(async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // Then create our targetConnect policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }],
                verbs: [{ type: VerbType.Shell }, { type: VerbType.Tunnel }]
            });
        });

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
            const targetConnectPolicy = targetConnectPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect')
            );
            policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);

            // delete outstanding configuration files
            //removeIfExists(userConfigFile);
            //removeIfExists(bzConfigFile);

        });

        // Called before each case
        beforeEach(() => {
            // Mocks must be cleared and restored prior to running each test
            // case. This is because Jest mocks and spies are global. We don't
            // want any captured mock state (invocations, spied args, etc.) and
            // mock implementations to leak through the different test runs.
            jest.restoreAllMocks();
            jest.clearAllMocks();
            mockStdin = stdin();
        });

        // Called after each case
        afterEach(() => {
            if (mockStdin) {
                mockStdin.restore();
            }
        });

        test("generate sshConfig", async () => {

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const generatePromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            process.nextTick(() => {
                mockStdin.send([userConfigFile, enterKey]);
            });
            await new Promise(r => setTimeout(r, 500));
            mockStdin.send([bzConfigFile, enterKey]);

            await generatePromise;

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            const includeStmt = `Include ${bzConfigFile}`;
            const userConfigContents = fs.readFileSync(userConfigFile).toString();
            expect(userConfigContents.includes(includeStmt)).toBe(true);

            // expect all the targets to appear in the bz-config
            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            for (const testTarget of ssmTestTargetsToRun) {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
                expect(bzConfigContents.includes(doTarget.ssmTarget.name)).toBe(true);
            }
        }, 60 * 1000);

        test("use sshConfig to connect", async () => {

            const pexec = promisify(exec);
            const { stdout, stderr } = await pexec(`which ssh`);
            console.log(stdout);
            for (const testTarget of ssmTestTargetsToRun) {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
                const { stdout, stderr } = await pexec(`ssh dev-bzero-${doTarget.ssmTarget.name} echo success`);
                expect(stdout).toEqual("success");
                expect(stderr).toEqual("");
            }

        }, 60 * 1000);

    });
};