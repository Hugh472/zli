import { BehaviorSubject, Observable } from 'rxjs';
import { IDisposable, WebsocketStream, TerminalSize } from '../../webshell-common-ts/websocket.service/websocket.service';
import { AuthConfigService } from '../../webshell-common-ts/auth-config-service/auth-config.service';

import { ConfigService } from '../config.service/config.service';
import { ShellState } from '../../webshell-common-ts/websocket.service/websocket.service.types';
import { ZliAuthConfigService } from '../config.service/zli-auth-config.service';


export class ShellTerminal implements IDisposable
{
    private websocketStream : WebsocketStream;
    // stdin
    private inputSubject: BehaviorSubject<string> = new BehaviorSubject<string>(null);
    private resizeSubject: BehaviorSubject<TerminalSize> = new BehaviorSubject<TerminalSize>({rows: 0, columns: 0});
    private blockInput: boolean = true;
    private terminalRunningStream: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
    public terminalRunning: Observable<boolean> = this.terminalRunningStream.asObservable();

    constructor(configService: ConfigService, connectionId: string)
    {
        this.websocketStream = new WebsocketStream(new ZliAuthConfigService(configService), connectionId, this.inputSubject, this.resizeSubject);
    }

    public async start(termSize: TerminalSize)
    {
        // Handle writing to stdout
        // TODO: bring this up a level
        this.websocketStream.outputData.subscribe(data => {
            process.stdout.write(Buffer.from(data, 'base64'));
        });

        // initial terminal size
        await this.websocketStream.start();

        this.websocketStream.shellStateData.subscribe(
            (newState: ShellState) => {
                if (newState.start) {
                    this.blockInput = false;
                    this.terminalRunningStream.next(true);
                } else if (newState.ready) {
                    this.websocketStream.sendShellConnect(termSize.rows, termSize.columns);
                } else if (newState.disconnect || newState.delete ) {
                    this.dispose();
                }
            },
            (error: any) => {
                this.terminalRunningStream.error(error);
            },
            () => {
                this.terminalRunningStream.error(undefined);
            }
        );
    }

    public resize(resizeEvent: TerminalSize)
    {
        if(! this.blockInput)
            this.resizeSubject.next({rows: resizeEvent.rows, columns: resizeEvent.columns});
    }

    public writeString(input: string) : void {
        if(! this.blockInput)
            this.inputSubject.next(input);
    }

    public writeBytes(input: Uint8Array) : void {
        this.writeString(new TextDecoder('utf-8').decode(input));
    }

    public dispose() : void
    {
        if(this.websocketStream)
            this.websocketStream.dispose();

        this.terminalRunningStream.complete();
    }
}