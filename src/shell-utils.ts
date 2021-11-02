import termsize from 'term-size';
import readline from 'readline';
import { ConfigService } from './services/config/config.service';
import { Logger } from './services/logger/logger.service';
import { ShellTerminal } from './terminal/terminal';
import { ConnectionSummary } from './services/connection/connection.types';
import { SessionService } from './services/session/session.service';
import { SessionDetails, SessionState } from './services/session/session.types';

export async function createAndRunShell(
    configService: ConfigService,
    logger: Logger,
    connectionSummary: ConnectionSummary
) {
    return new Promise<number>(async (resolve, _) => {
        // connect to target and run terminal
        const terminal = new ShellTerminal(logger, configService, connectionSummary);
        try {
            await terminal.start(termsize());
        } catch (err) {
            logger.error(`Error connecting to terminal: ${err.stack}`);
            resolve(1);
            return;
        }

        // Terminal resize event logic
        // https://nodejs.org/api/process.html#process_signal_events -> SIGWINCH
        // https://github.com/nodejs/node/issues/16194
        // https://nodejs.org/api/process.html#process_a_note_on_process_i_o
        process.stdout.on(
            'resize',
            () => {
                const resizeEvent = termsize();
                terminal.resize(resizeEvent);
            }
        );

        terminal.terminalRunning.subscribe(
            () => { },
            // If an error occurs in the terminal running observable then log the
            // error, clean up the connection, and exit zli
            async (error) => {
                logger.error(error);
                terminal.dispose();
                resolve(1);
            },
            // If terminal running observable completes without error, exit zli
            // without closing the connection
            async () => {
                terminal.dispose();
                resolve(0);
            }
        );

        // To get 'keypress' events you need the following lines
        // ref: https://nodejs.org/api/readline.html#readline_readline_emitkeypressevents_stream_interface
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        // Force stdin to be in flowing mode in case the stream was paused.
        // The stream is paused when connect() is called from quickstart due
        // to the way the prompt library works.
        if (process.stdin.readableFlowing === false) {
            process.stdin.resume();
        }

        // Max input delay to wait, in ms
        let maxInputDelay = 1;
        let previousInput = Date.now();
        const maxInputDelayLimit = 101;
        const inputDelayIncrease = 5;

        // To keep track of this is a large stdin buffer (i.e. copy paste)
        let inputBuffer: string[] = [];
        let bufferFunction: NodeJS.Timeout = null;

        process.stdin.on('keypress', async (_, key) => {
            // Implement some custom logic for batching input
            // Ref: https://stackoverflow.com/questions/66755705/detect-pasted-input-with-readline-nodejs

            // Add our input to our array of input
            inputBuffer.push(key.sequence);

            // Keep increasing maxInputDelay if the last input was less than 5ms ago
            // We cap this wait at maxInputDelayLimit-ms
            if ((Date.now() - previousInput) < inputDelayIncrease) {
                // Only increase if our maxInputDelay < maxInputDelayLimit
                if (maxInputDelay < maxInputDelayLimit) {
                    maxInputDelay += inputDelayIncrease;
                }
            } else {
                // Else reset our delay
                maxInputDelay = 1;
            }

            // Update when we got our last input
            previousInput = Date.now();

            // If we get a new input, clear the timeout function
            if (bufferFunction === null) {
                // send the input to a function after a certain amount of time has passed
                bufferFunction = setTimeout(() => {
                    // Loop over the array, and send it as chunks of 10000
                    // Otherwise we get keysplitting/general errors if we try to send too much data
                    const chunk = 10000;
                    for (let i = 0; i < inputBuffer.length; i += chunk) {
                        // Write the chunk
                        // If i+chunk is > inputBuffer.length, it uses the length of the array
                        // Ref: https://stackoverflow.com/questions/36595891/array-prototype-slice-what-if-the-end-param-is-greater-than-the-array-length
                        const bufferChunk = inputBuffer.slice(i, i + chunk);
                        terminal.writeString(bufferChunk.join(''));
                    }

                    // Reset out input buffer
                    inputBuffer = [];
                    bufferFunction = null;
                }, maxInputDelay);
            }
        });
    });
}

export async function getCliSpace(
    sessionService: SessionService,
    logger: Logger
): Promise<SessionDetails> {
    const listSessions = await sessionService.ListSessions();

    // space names are not unique, make sure to find the latest active one
    const cliSpace = listSessions.sessions.filter(s => s.displayName === 'cli-space' && s.state == SessionState.Active); // TODO: cli-space name can be changed in config

    if (cliSpace.length === 0) {
        return undefined;
    } else if (cliSpace.length === 1) {
        return cliSpace[0];
    } else {
        // there should only be 1 active 'cli-space' session
        logger.warn(`Found ${cliSpace.length} cli spaces while expecting 1, using latest one`);
        return cliSpace.pop();
    }
}