import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { Logger } from '../logger.service/logger';
import { ConfigService } from '../config.service/config.service';

interface StartSsmTunnelMessage {
    targetId: string;
    targetPort: number;
}

interface SsmTunnelDataMessage {
    data: string;
}

export class SsmTunnelService
{
    private websocket : HubConnection;

    constructor(
        private logger: Logger,
        private configService: ConfigService
    )
    {
    }

    public async setupWebsocketTunnel(
        hostName: string,
        userName: string,
        port: number,
        identityFile: string
    ) {
        let targetId = this.parseTargetIdFromHost(hostName);

        await this.startWebsocket();

        // TODO: why isnt this triggered on server restarts?
        this.websocket.onclose((error) => {
            this.logger.error(`Websocket was closed by server: ${error}`);
        });

        this.websocket.on("ReceiveData", (dataMessage: SsmTunnelDataMessage) => {
            try {
                let buf = Buffer.from(dataMessage.data, 'base64');
                // this.logger.info("Incoming message >>>>>" + buf.toString("utf8"));

                // Write to standard out for ProxyCommand to consume
                process.stdout.write(buf);
            } catch(e) {
                this.logger.error(`Error in ReceiveData: ${e}`);
            }
        });

        await this.sendStartTunnelMessage({
            targetId: targetId,
            targetPort: port
        });

        // TODO: Send websocket message to add the user's SSH pubkey to the
        // target's sshd authorized_keys
    }

    public async sendDataMessage(data: Buffer) {
        this.logger.debug("Outgoing message >>>> " + data.toString('base64'));
        let base64EncData = data.toString('base64');
        let dataMessage: SsmTunnelDataMessage = {
            data: base64EncData
        };

        await this.sendWebsocketMessage<SsmTunnelDataMessage>("SendData", dataMessage);
    }

    private createConnection(): HubConnection {
        // sessionId is for user authentication
        const queryString = `?session_id=${this.configService.sessionId()}`;
        const connectionUrl = `${this.configService.serviceUrl()}api/v1/hub/ssm-tunnel/${queryString}`;
        
        const connectionBuilder = new HubConnectionBuilder();
        connectionBuilder.withUrl(
            connectionUrl, 
            { headers: { authorization: this.configService.getAuthHeader() } }
        ).configureLogging(6); // log level 6 is no websocket logs
    
        return connectionBuilder.build();
    }

    private async startWebsocket()
    {
        this.websocket = this.createConnection();
        await this.websocket.start();
    }

    private sendStartTunnelMessage(startTunnelMessage: StartSsmTunnelMessage) {
        return this.sendWebsocketMessage<StartSsmTunnelMessage>(
            "StartTunnel", 
            startTunnelMessage
        );
    }

    private async sendWebsocketMessage<T>(methodName: string, message: T) {
        if(this.websocket.state == HubConnectionState.Disconnected)
            throw new Error("Hub disconnected");

        await this.websocket.invoke(methodName, message);
    }
    
    private async closeConnection() {
        if(this.websocket) {
            await this.websocket.stop();
            this.websocket = undefined;
        }
    }

    private parseTargetIdFromHost(host: string): string {
        let prefix = "bzero-";

        if(! host.startsWith(prefix)) {
            this.logger.error(`Invalid host provided must have form ${prefix}<targetId>`);
            throw Error("Invalid host");
        }

        let targetId = host.substr(prefix.length);

        // TODO: Validate the targetId. We may want to do more then just check
        // for a valid guid and also check that this target exists when listing
        // ssm targets

        return targetId;
    }
}