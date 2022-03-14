import os from 'os';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { MockSTDIN, stdin } from 'mock-stdin';
import { configService, logger, loggerConfigService, policyService, ssmTestTargetsToRun, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets, cleanupTargetConnectPolicies } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { removeIfExists } from '../../../utils/utils';
import { DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { VerbType } from '../../../../src/services/v1/policy-query/policy-query.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../../src/services/v1/policy/policy.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { TestUtils } from '../utils/test-utils';

export const sshSuite = () => {
    describe('ssh suite', () => {
        let mockStdin: MockSTDIN;
        const targetUser = 'ssm-user';
        const policyType = 'target-ssh';
        const uniqueUser = `user-${systemTestUniqueId}`;
        const enterKey = '\x0D';

        const userConfigFile = path.join(
            os.homedir(), '.ssh', 'test-config-user'
        );

        const bzConfigFile = path.join(
            os.homedir(), '.ssh', 'test-config-bz'
        );

        // Cleanup all policy after the tests
        afterAll(async () => {
            // delete outstanding configuration files
            removeIfExists(userConfigFile);
            removeIfExists(bzConfigFile);
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

        test('generate sshConfig', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', policyType),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const zliPromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            await process.nextTick(async () => {
                await new Promise(r => setTimeout(r, 2000));
                mockStdin.send([userConfigFile, enterKey]);
            });
            await process.nextTick(async () => {
                await new Promise(r => setTimeout(r, 2000));
                mockStdin.send([bzConfigFile, enterKey]);
            });

            await zliPromise;
            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            // expect the default username to appear in the bz-config
            expect(bzConfigContents.includes(targetUser)).toBe(true);

            // don't delete policies, because ssh tunnel tests need them
        }, 60 * 1000);

        test.each(ssmTestTargetsToRun)('ssh tunnel to %p', async (testTarget) => {
            // use the config file we just created to ssh without specifying a user or identity file
            const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
            const command = `ssh -F ${userConfigFile} -o StrictHostKeyChecking=no ${doTarget.ssmTarget.name} echo success`;

            const pexec = promisify(exec);
            const { stdout, stderr } = await pexec(command);
            expect(stdout.trim()).toEqual('success');
            expect(stderr.includes('Warning: Permanently added')).toBe(true);

        }, 60 * 1000);

        test('generate sshConfig with multiple users', async () => {
            // delete policy from previous test
            await cleanupTargetConnectPolicies(policyType);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            //  create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', policyType),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }, { userName: uniqueUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const zliPromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            await process.nextTick(async () => {
                await new Promise(r => setTimeout(r, 2000));
                mockStdin.send([userConfigFile, enterKey]);
            });
            await process.nextTick(async () => {
                await new Promise(r => setTimeout(r, 2000));
                mockStdin.send([bzConfigFile, enterKey]);
            });

            await zliPromise;
            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            await cleanupTargetConnectPolicies(policyType);

        }, 60 * 1000);

        test('generate sshConfig without tunnel access', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', policyType),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: uniqueUser }],
                verbs: [{ type: VerbType.Shell }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const zliPromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            await process.nextTick(async () => {
                await new Promise(r => setTimeout(r, 2000));
                mockStdin.send([userConfigFile, enterKey]);
            });
            await process.nextTick(async () => {
                await new Promise(r => setTimeout(r, 2000));
                mockStdin.send([bzConfigFile, enterKey]);
            });

            await zliPromise;
            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect none of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, false);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            await cleanupTargetConnectPolicies(policyType);

        }, 60 * 1000);
    });
};

/**
 * Helper functions to reduce test redundancy
 */
function expectIncludeStmtInConfig(userFile: string, bzFile: string): void {
    const includeStmt = `Include ${bzFile}`;
    const userConfigContents = fs.readFileSync(userFile).toString();
    expect(userConfigContents.includes(includeStmt)).toBe(true);
}
function expectTargetsInBzConfig(contents: string, toBe: boolean): void {
    for (const testTarget of ssmTestTargetsToRun) {
        const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
        expect(contents.includes(doTarget.ssmTarget.name)).toBe(toBe);
    }
}