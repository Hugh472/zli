import os from 'os';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { PolicyQueryHttpService } from '../../../http-services/policy-query/policy-query.http-services';
import { MockSTDIN, stdin } from 'mock-stdin';
import { configService, policyService, ssmTestTargetsToRun, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets } from '../system-test';
import { callZli } from '../utils/zli-utils';
import { removeIfExists } from '../../../utils/utils';
import { DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { VerbType } from '../../../../src/services/v1/policy-query/policy-query.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../../src/services/v1/policy/policy.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';

export const sshSuite = () => {
    describe('ssh suite', () => {
        let mockStdin: MockSTDIN;
        const targetUser = 'ssm-user';
        const enterKey = '\x0D';

        const userConfigFile = path.join(
            os.homedir(), '.ssh', 'test-config-user'
        );

        const bzConfigFile = path.join(
            os.homedir(), '.ssh', 'test-config-bz'
        );

        const currentUser: Subject = {
            id: configService.me().id,
            type: SubjectType.User
        };
        const environment: Environment = {
            id: systemTestEnvId
        };

        /*
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
        */

        // Cleanup all policy after the tests
        afterAll(async () => {
            /*
            // Search and delete our target connect policy
            const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
            const targetConnectPolicy = targetConnectPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect')
            );
            policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);
            
            */
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

            const uniqueUser = `user-${systemTestUniqueId}`;
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

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const generatePromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            process.nextTick(() => {
                mockStdin.send([userConfigFile, enterKey]);
            });
            await new Promise(r => setTimeout(r, 500));
            mockStdin.send([bzConfigFile, enterKey]);
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
            // expect the username to appear in the bz-config
            expect(bzConfigContents.includes(targetUser)).toBe(true);


        }, 30 * 1000);


        test.each(ssmTestTargetsToRun)('ssh proxy to %p', async (testTarget) => {
            const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

            const pexec = promisify(exec);
            // TODO: will it always be dev-bzero?
            // use the config file we just created to ssh without specifying a user or identity file
            const command = `ssh -F ${userConfigFile} -o StrictHostKeyChecking=no dev-bzero-${doTarget.ssmTarget.name} echo success`;
            const { stdout, stderr } = await pexec(command);
            expect(stdout.trim()).toEqual('success');
            expect(stderr.includes('Warning: Permanently added')).toBe(true);

        }, 60 * 1000);

        test('generate sshConfig with multiple users', async () => {

            const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
            const targetConnectPolicy = targetConnectPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect')
            );
            await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);

            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            const uniqueUser = `user-${systemTestUniqueId}`;

            // Then create our targetConnect policy
            try {
                await policyService.AddTargetConnectPolicy({
                    name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                    subjects: [currentUser],
                    groups: [],
                    description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: targetUser }, { userName: uniqueUser }],
                    verbs: [{ type: VerbType.Shell }, { type: VerbType.Tunnel }]
                });
            } catch (err) {
                console.log("farted on policy 2");
                throw err
            }

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const generatePromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            process.nextTick(() => {
                mockStdin.send([userConfigFile, enterKey]);
            });
            await new Promise(r => setTimeout(r, 500));
            mockStdin.send([bzConfigFile, enterKey]);
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
            // expect the username not to appear in the bz-config
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            try {
                const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
                const targetConnectPolicy = targetConnectPolicies.find(policy =>
                    policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect')
                );
                await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);

            } catch (err) {
                console.log("Farted on delete policy 2");
            }
        }, 30 * 1000);


        test('generate sshConfig without tunnel access', async () => {
            const currentUser: Subject = {
                id: configService.me().id,
                type: SubjectType.User
            };
            const environment: Environment = {
                id: systemTestEnvId
            };

            const uniqueUser = `user-${systemTestUniqueId}`;

            // Then create our targetConnect policy
            try {
                await policyService.AddTargetConnectPolicy({
                    name: systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect'),
                    subjects: [currentUser],
                    groups: [],
                    description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                    environments: [environment],
                    targets: [],
                    targetUsers: [{ userName: uniqueUser }],
                    verbs: [{ type: VerbType.Shell }]
                });
            } catch (err) {
                console.log("farted on policy 3");
                throw err
            }

            const tunnelsSpy = jest.spyOn(PolicyQueryHttpService.prototype, 'GetTunnels');
            const generatePromise = callZli(['generate', 'sshConfig']);

            // respond to interactive prompt
            process.nextTick(() => {
                mockStdin.send([userConfigFile, enterKey]);
            });
            await new Promise(r => setTimeout(r, 500));
            mockStdin.send([bzConfigFile, enterKey]);
            await new Promise(r => setTimeout(r, 500));
            mockStdin.send([bzConfigFile, enterKey]);

            await generatePromise;

            expect(tunnelsSpy).toHaveBeenCalled();

            // expect user's config file to include the bz file
            const includeStmt = `Include ${bzConfigFile}`;
            const userConfigContents = fs.readFileSync(userConfigFile).toString();
            expect(userConfigContents.includes(includeStmt)).toBe(true);

            // expect none of the targets to appear in the bz-config
            const bzConfigContents = fs.readFileSync(bzConfigFile).toString();
            for (const testTarget of ssmTestTargetsToRun) {
                const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;
                expect(bzConfigContents.includes(doTarget.ssmTarget.name)).toBe(false);
            }
            // expect the username not to appear in the bz-config
            console.log(JSON.stringify(bzConfigContents));
            expect(bzConfigContents.includes(uniqueUser)).toBe(false);

            const targetConnectPolicies = await policyService.ListTargetConnectPolicies();
            const targetConnectPolicy = targetConnectPolicies.find(policy =>
                policy.name == systemTestPolicyTemplate.replace('$POLICY_TYPE', 'target-connect')
            );
            await policyService.DeleteTargetConnectPolicy(targetConnectPolicy.id);

        }, 30 * 1000);


    });
};