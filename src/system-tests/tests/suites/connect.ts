import { MockSTDIN, stdin } from 'mock-stdin';
import * as ShellUtils from '../../../utils/shell-utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import waitForExpect from 'wait-for-expect';
import { configService, logger, loggerConfigService, policyService, ssmTestTargetsToRun, systemTestEnvId, systemTestPolicyTemplate, systemTestUniqueId, testTargets, cleanupTargetConnectPolicies } from '../system-test';
import { getMockResultValue } from '../utils/jest-utils';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';
import { DigitalOceanSSMTarget } from '../../digital-ocean/digital-ocean-ssm-target.service.types';
import { TestUtils } from '../utils/test-utils';
import { VerbType } from '../../../../src/services/v1/policy-query/policy-query.types';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../../src/services/v1/policy/policy.types';
import { Environment } from '../../../../webshell-common-ts/http/v2/policy/types/environment.types';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';

export const connectSuite = () => {
    describe('connect suite', () => {
        let mockStdin: MockSTDIN;
        const targetUser = 'ssm-user';
        const policyType = 'target-connect';
        const testUtils = new TestUtils(configService, logger, loggerConfigService);
        const enterKey = '\x0D';

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
                name: systemTestPolicyTemplate.replace('$POLICY_TYPE', policyType),
                subjects: [currentUser],
                groups: [],
                description: `Target connect policy created for system test: ${systemTestUniqueId}`,
                environments: [environment],
                targets: [],
                targetUsers: [{ userName: targetUser }],
                verbs: [{ type: VerbType.Shell }, { type: VerbType.Tunnel }]
            });
        }, 15 * 1000);

        // Cleanup all policy after the tests
        afterAll(async () => {
            // Search and delete our target connect policy
            await cleanupTargetConnectPolicies(policyType);
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

        test.each(ssmTestTargetsToRun)('zli connect %p', async (testTarget) => {
            const doTarget = testTargets.get(testTarget) as DigitalOceanSSMTarget;

            // Spy on result Bastion gives for shell auth details. This spy is
            // used at the end of the test to assert the correct regional
            // connection node was used to establish the websocket.
            const shellConnectionAuthDetailsSpy = jest.spyOn(ConnectionHttpService.prototype, 'GetShellConnectionAuthDetails');

            // Spy on output pushed to stdout
            const capturedOutput: string[] = [];
            const outputSpy = jest.spyOn(ShellUtils, 'pushToStdOut')
                .mockImplementation((output) => {
                    capturedOutput.push(Buffer.from(output).toString('utf-8'));
                });

            // Call "zli connect"
            const connectPromise = callZli(['connect', `${targetUser}@${doTarget.ssmTarget.name}`]);

            // Ensure that the created and connect event exists
            expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.ClientConnect));
            expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.Created));

            // Assert the output spy receives the same input sent to mock stdIn.
            // Keep sending input until the output spy says we've received what
            // we sent (possibly sends command more than once).

            await waitForExpect(
                () => {
                    // Wait for there to be some output
                    expect(outputSpy).toHaveBeenCalled();

                    // There is still a chance that pty is not ready, or
                    // blockInput is still true (no shell start received).
                    // Therefore, we might send this command more than once.
                    // Also, most likely there is some network delay to receive
                    // output.
                    mockStdin.send('echo \"hello world\"');
                    mockStdin.send(enterKey);

                    // Check that "hello world" exists somewhere in the output
                    // (could be in "echo" command or in the output from running
                    // "echo")
                    const expectedRegex = [
                        expect.stringMatching(new RegExp('hello world'))
                    ];
                    expect(capturedOutput).toEqual(
                        expect.arrayContaining(expectedRegex),
                    );
                },
                1000 * 30,  // Timeout
            );

            // Send exit to the terminal so the zli connect handler will exit
            // and the test can complete. However we must override the mock
            // implementation of cleanExit to allow the zli connect command to
            // exit with code 1 without causing the test to fail.

            // TODO: This could be cleaned up in the future if we exit the zli
            // with exit code = 0 in this case. Currently there is no way for us
            // to distinguish between a normal closure (user types exit) and an
            // abnormal websocket closure
            jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementationOnce(() => Promise.resolve());
            mockStdin.send('exit');
            mockStdin.send(enterKey);

            // Wait for connect shell to cleanup
            await connectPromise;

            // Assert shell connection auth details returns expected connection
            // node region
            expect(shellConnectionAuthDetailsSpy).toHaveBeenCalled();
            const gotShellConnectionAuthDetails = await getMockResultValue(shellConnectionAuthDetailsSpy.mock.results[0]);
            expect(gotShellConnectionAuthDetails.region).toBe<string>(testTarget.awsRegion);

            // Ensure that the client disconnect event is here
            // Note, there is no close event since we do not close the connection, just disconnect from it
            expect(await testUtils.EnsureConnectionEventCreated(doTarget.ssmTarget.id, doTarget.ssmTarget.name, targetUser, 'SSM', ConnectionEventType.ClientDisconnect));
        }, 60 * 1000);

    });
};