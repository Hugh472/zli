import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { configService, policyService, ssmTestTargetsToRun, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets, cleanupTargetConnectPolicies } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { removeIfExists } from '../../../utils/utils';
import { DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { VerbType } from '../../../../src/services/v1/policy-query/policy-query.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../../src/services/v1/policy/policy.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';

export const sshSuite = () => {
    describe('ssh suite', () => {
        const targetUser = 'ssm-user';
        const uniqueUser = `user-${systemTestUniqueId}`;

        const userConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-user'
        );

        const bzConfigFile = path.join(
            process.env.HOME, '.ssh', 'test-config-bz'
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
        });

        test('2156: generate sshConfig', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

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

        ssmTestTargetsToRun.forEach(async (testTarget) => {
            it(`${testTarget.sshCaseId}: ssh tunnel - ${testTarget.awsRegion} - ${testTarget.installType} - ${testTarget.dropletImage}`, async () => {
                // use the config file we just created to ssh without specifying a user or identity file
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
                const command = `ssh -F ${userConfigFile} -o CheckHostIP=no -o StrictHostKeyChecking=no ${doTarget.ssmTarget.name} echo success`;

                const pexec = promisify(exec);
                const { stdout } = await pexec(command);
                expect(stdout.trim()).toEqual('success');

            }, 60 * 1000);
        });

        test('2157: generate sshConfig with multiple users', async () => {
            // delete policy from previous test
            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            //  create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }, { userName: uniqueUser }],
                verbs: [{ type: VerbType.Tunnel }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect all of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, true);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

        }, 60 * 1000);

        test('2158: generate sshConfig without tunnel access', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            // create our policy
            await policyService.AddTargetConnectPolicy({
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                subjects: [currentUser],
                groups: [],
                description: `Target ssh policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: uniqueUser }],
                verbs: [{ type: VerbType.Shell }]
            });

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            await callZli(['generate', 'sshConfig', '--mySshPath', userConfigFile, '--bzSshPath', bzConfigFile]);

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            expectIncludeStmtInConfig(userConfigFile, bzConfigFile);

            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            // expect none of the targets to appear in the bz-config
            expectTargetsInBzConfig(bzConfigContents, false);

            // expect the unique username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            await cleanupTargetConnectPolicies(systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'));

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