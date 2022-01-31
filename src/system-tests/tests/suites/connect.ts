import { MockSTDIN, stdin } from 'mock-stdin';
import * as ShellUtils from '../../../utils/shell-utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import waitForExpect from 'wait-for-expect';
import { ssmTestTargetsToRun, testTargets } from '../system-test';
import { getMockResultValue } from '../utils/jest-utils';
import { callZli } from '../utils/zli-utils';
import { ConnectionHttpService } from '../../../http-services/connection/connection.http-services';

export const connectSuite = () => {
    describe('connect suite', () => {
        let mockStdin: MockSTDIN;

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
            const doTarget = testTargets.get(testTarget);

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
            const connectPromise = callZli(['connect', `ssm-user@${doTarget.ssmTarget.name}`]);

            // Assert the output spy receives the same input sent to mock stdIn.
            // Keep sending input until the output spy says we've received what
            // we sent (possibly sends command more than once).
            const enterKey = '\x0D';
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
        }, 60 * 1000);
    });
};