import { MockSTDIN, stdin } from 'mock-stdin';
import { ShellTerminal } from '../../../terminal/terminal';
import * as ShellUtils from '../../../utils/shell-utils';
import * as CleanExitHandler from '../../../handlers/clean-exit.handler';
import waitForExpect from 'wait-for-expect';
import { Subscription } from 'rxjs';
import { imagesToRun, testTargets } from '../system-test';
import { getMockResultValue } from '../utils/jest-utils';
import { callZli } from '../utils/zli-utils';

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

        test.each(imagesToRun)('zli connect %p', async (image) => {
            const doTarget = testTargets.get(image);

            // Spy on terminal running getter so this test can spy+subscribe
            // on the terminal running observable used by ShellTerminal to
            // indicate that the terminal is ready to receive input
            const terminalRunningSpy = jest.spyOn(ShellTerminal.prototype, 'terminalRunning', 'get');

            // Spy on output pushed to stdout
            const capturedOutput: string[] = [];
            const outputSpy = jest.spyOn(ShellUtils, 'pushToStdOut')
                .mockImplementation((output) => {
                    capturedOutput.push(Buffer.from(output).toString('utf-8'));
                });

            // Call "zli connect"
            const connectPromise = callZli(['connect', `ssm-user@${doTarget.ssmTarget.name}`]);

            // This promise is resolved when ShellTerminal sets blockInput
            // to false, and sends next(true) on the terminalRunning
            // subject.
            //
            // Note: We must wrap the expect call in waitForExpect because
            // zli connect does some async things (call bastion, get auth
            // token, connect to connection node, etc.) before finally
            // subscribing on terminalRunning.
            let terminalRunningSub: Subscription;
            const terminalIsReadyForInput = new Promise<boolean>(async (resolve, reject) => {
                await waitForExpect(() => {
                    expect(terminalRunningSpy).toHaveBeenCalled();

                    const terminalRunningObservable = getMockResultValue(terminalRunningSpy.mock.results[0]);
                    terminalRunningSub = terminalRunningObservable.subscribe(
                        () => resolve(true),
                        (err) => reject(new Error(`terminalRunning observable returned error: ${err}`))
                    );
                }, 1000 * 10);
            }).finally(() => terminalRunningSub.unsubscribe());

            // Wait for terminal to be ready before we start sending keystrokes
            // to stdin await
            await Promise.race([terminalIsReadyForInput, connectPromise]);

            // Start sending input
            // Mock stdin input so we can send input programmatically to the
            // terminal
            const enterKey = '\x0D';
            mockStdin.send('echo \"hello world\"');
            mockStdin.send(enterKey);

            // Assert the output spy receives the same input sent to mock stdIn
            await waitForExpect(() => {
                expect(outputSpy).toHaveBeenCalled();
                expect(capturedOutput.find(e => e.indexOf('hello world') !== -1)).toBeTruthy();
            }, 1000 * 10);

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
        }, 60 * 1000);
    });
};