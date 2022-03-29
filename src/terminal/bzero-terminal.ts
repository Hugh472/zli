import { Observable, Subject, Subscription } from 'rxjs';
import { ShellWebsocketService } from '../../webshell-common-ts/shell-websocket.service/shell-websocket.service';
import { IDisposable } from '../../webshell-common-ts/utility/disposable';
import { KeySplittingService } from '../../webshell-common-ts/keysplitting.service/keysplitting.service';

import { ConfigService } from '../services/config/config.service';
import { IShellWebsocketService, ShellEvent, ShellEventType, TerminalSize } from '../../webshell-common-ts/shell-websocket.service/shell-websocket.service.types';
import { ZliAuthConfigService } from '../services/config/zli-auth-config.service';
import { Logger } from '../services/logger/logger.service';
import { ConnectionSummary } from '../../webshell-common-ts/http/v2/connection/types/connection-summary.types';
import { ConnectionHttpService } from '../http-services/connection/connection.http-services';
import { BzeroTargetHttpService } from '../http-services/targets/bzero/bzero.http-services';

export class ShellTerminal implements IDisposable
{
    private shellWebsocketService : IShellWebsocketService;
    private shellEventDataSubscription: Subscription;
    private currentTerminalSize: TerminalSize;

    // private refreshTargetInfoOnReady: boolean = false;

    // stdin
    private inputSubject: Subject<string> = new Subject<string>();
    private resizeSubject: Subject<TerminalSize> = new Subject<TerminalSize>();

    // terminal ready
    private terminalRunningStream: Subject<boolean> = new Subject<boolean>();
    private _terminalRunning: Observable<boolean> = this.terminalRunningStream.asObservable();
    get terminalRunning(): Observable<boolean> {
        return this._terminalRunning;
    }
    private blockInput: boolean = true;

    // stdout
    private outputSubject: Subject<Uint8Array> = new Subject<Uint8Array>();
    public outputObservable: Observable<Uint8Array> = this.outputSubject.asObservable();


    constructor(private logger: Logger, private configService: ConfigService, private connectionSummary: ConnectionSummary)
    {
    }

    private async createShellWebsocketService() : Promise<IShellWebsocketService> {
        const targetId = this.connectionSummary.targetId;

        const connectionHttpService = new ConnectionHttpService(this.configService, this.logger);
        const shellConnectionAuthDetails = await connectionHttpService.GetShellConnectionAuthDetails(this.connectionSummary.id);

        const bzeroTargetHttpService = new BzeroTargetHttpService(this.configService, this.logger);
        const bzeroTargetInfo = await bzeroTargetHttpService.GetBzeroTarget(targetId);

        return new ShellWebsocketService(
            new KeySplittingService(this.configService, this.logger),
            bzeroTargetInfo,
            this.connectionSummary.targetUser,
            this.logger,
            new ZliAuthConfigService(this.configService, this.logger),
            this.connectionSummary.id,
            { authToken: shellConnectionAuthDetails.authToken, connectionServiceUrl: shellConnectionAuthDetails.connectionServiceUrl },
            this.inputSubject,
            this.resizeSubject
        );
    }

    public async start(termSize: TerminalSize): Promise<void>
    {
        this.currentTerminalSize = termSize;
        this.shellWebsocketService = await this.createShellWebsocketService();

        // Handle writing to stdout
        // TODO: bring this up a level
        this.shellWebsocketService.outputData.subscribe((data: string) => {
            // Push to outputSubject which pushes to stdout at a higher level
            this.outputSubject.next(Buffer.from(data, 'base64'));
        });

        await this.shellWebsocketService.start();

        this.shellEventDataSubscription = this.shellWebsocketService.shellEventData.subscribe(
            async (shellEvent: ShellEvent) => {
                this.logger.debug(`Got ShellEvent: ${shellEvent.type}`);

                switch(shellEvent.type) {
                case ShellEventType.Start:
                    this.blockInput = false;
                    this.terminalRunningStream.next(true);
                    this.resize(this.currentTerminalSize);
                    break;
                case ShellEventType.Unattached:
                    // When another client connects handle this by
                    // exiting this ZLI process without closing the
                    // connection and effectively transferring ownership of
                    // the connection to the other client
                    this.logger.error('Another client has attached to this connection.');
                    this.terminalRunningStream.complete();
                    break;
                case ShellEventType.Disconnect:
                    this.terminalRunningStream.error('Target Disconnected.');
                    break;
                case ShellEventType.Delete:
                    this.terminalRunningStream.error('Connection was closed.');
                    break;
                case ShellEventType.BrokenWebsocket:
                    this.blockInput = true;
                    this.logger.warn('BastionZero: 503 service unavailable. Reconnecting...');
                    break;
                default:
                    this.logger.warn(`Unhandled shell event type ${shellEvent.type}`);
                }
            },
            (error: any) => {
                this.terminalRunningStream.error(error);
            },
            () => {
                this.terminalRunningStream.error('ShellEventData subscription completed prematurely');
            }
        );
    }

    public resize(terminalSize: TerminalSize): void
    {
        this.logger.trace(`New terminal resize event (rows: ${terminalSize.rows} cols: ${terminalSize.columns})`);

        // Save the new terminal dimensions even if the shell input is blocked
        // so that when we start the shell we initialize the terminal dimensions
        // correctly
        this.currentTerminalSize = terminalSize;

        if(! this.blockInput)
            this.resizeSubject.next({rows: terminalSize.rows, columns: terminalSize.columns});
    }

    public writeString(input: string) : void {
        if(! this.blockInput) {
            this.inputSubject.next(input);
        } else {
            // char code 3 is SIGINT
            if( input.charCodeAt(0) === 3 )
                this.terminalRunningStream.error('Terminal killed');
        }
    }

    public writeBytes(input: Uint8Array) : void {
        this.writeString(new TextDecoder('utf-8').decode(input));
    }

    public dispose() : void
    {
        // First unsubscribe to shell event subscription because this wil be
        // completed when disposing the shellWebsocketService
        if(this.shellEventDataSubscription)
            this.shellEventDataSubscription.unsubscribe();

        if(this.shellWebsocketService)
            this.shellWebsocketService.dispose();

        this.terminalRunningStream.complete();
    }
}