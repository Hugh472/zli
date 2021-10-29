import { Observable } from 'rxjs';
import { bufferTime, filter } from 'rxjs/operators';
import termsize from 'term-size';
import { ConfigService } from './services/config/config.service';
import { Logger } from './services/logger/logger.service';
import { ShellTerminal } from './terminal/terminal';
import { ConnectionSummary } from './services/connection/connection.types';
import { SessionService } from './services/session/session.service';
import { SessionDetails, SessionState } from './services/session/session.types';
import { TerminalSessionInfo } from './terminal/terminal.types';
import { MetricsCollectionService } from './services/metrics/metrics-collection.service';
import { MetricsHttpService } from './services/metrics/metrics-http.service';

export async function createAndRunShell(
    configService: ConfigService,
    logger: Logger,
    connectionSummary: ConnectionSummary
) {
    return new Promise<number>(async (resolve, _) => {
        // connect to target and run terminal
        const terminal = new ShellTerminal(logger, configService, connectionSummary);
        let terminalSessionInfo : TerminalSessionInfo;
        try {
            terminalSessionInfo = await terminal.start(termsize());
        } catch (err) {
            logger.error(`Error connecting to terminal: ${err.stack}`);
            resolve(1);
            return;
        }

        // Create MetricsService for this shell session
        const metricsService = new MetricsCollectionService(logger, connectionSummary.id, new MetricsHttpService(terminalSessionInfo.connectionNodeId, configService, logger));

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

        const source = new Observable<string>(function (observer) {
            // To get 'keypress' events you need the following lines
            // ref: https://nodejs.org/api/readline.html#readline_readline_emitkeypressevents_stream_interface
            const readline = require('readline');
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

            process.stdin.on('keypress', async (_, key) => {
                // TODO-metrics: Add config flag for metrics
                await metricsService.newInputReceived();
                observer.next(key.sequence);
            });
        });
        source.pipe(bufferTime(50), filter(buffer => buffer.length > 0)).subscribe(keypresses => {
            // This pipe is in order to allow copy-pasted input to be treated like a single string
            terminal.writeString(keypresses.join(''));
        });

        // Write received output to stdout
        terminal.outputObservable.subscribe(async data => {
            // TODO-metrics: Add config flag for metrics
            await metricsService.newOutputReceived();
            process.stdout.write(data);
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