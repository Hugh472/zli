import util from 'util';
import crypto from 'crypto';
import fs from 'fs';

import SshPK from 'sshpk';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';

import { Logger } from '../logger.service/logger';
import { ConfigService } from '../config.service/config.service';
import { AddSshPubKeyMessage, StartTunnelMessage, TunnelDataMessage } from './ssm-tunnel.types';


export class SsmTunnelService
{
    private websocket : HubConnection;

    constructor(
        private logger: Logger,
        private configService: ConfigService,
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

        await Promise.all([
            this.setupWebsocket(),
            this.setupEphemeralSshKey(identityFile)
        ]);

        await this.sendStartTunnelMessage({
            targetId: targetId,
            targetPort: port,
            targetUser: userName
        });

        await this.sendPubKeyFromIdentityFile(identityFile);
    }

    private async setupWebsocket() {
        await this.startWebsocket();

        // TODO: why isnt this triggered on server restarts?
        this.websocket.onclose((error) => {
            this.logger.error(`Websocket was closed by server: ${error}`);
        });

        this.websocket.on('ReceiveData', (dataMessage: TunnelDataMessage) => {
            try {
                let buf = Buffer.from(dataMessage.data, 'base64');
                // this.logger.debug('Incoming message >>>>>' + buf.toString('utf8'));

                // Write to standard out for ProxyCommand to consume
                process.stdout.write(buf);
            } catch(e) {
                this.logger.error(`Error in ReceiveData: ${e}`);
            }
        });
    }

    private async setupEphemeralSshKey(identityFile: string): Promise<void> {
        return new Promise(async (res, rej) => {
            let bzeroSshKeyPath = this.configService.sshKeyPath();

            // Only generate a new ssh key if the identity file provided is
            // managed by bzero
            if(identityFile === bzeroSshKeyPath) {
                try {
                    let privateKey = await this.generateEphemeralSshKey();
                    await util.promisify(fs.writeFile)(bzeroSshKeyPath, privateKey, {
                        mode: '0600'
                    });
                } catch(err) {
                    rej(err)
                }
            }
            res();
        });
    }

    private async generateEphemeralSshKey() : Promise<string> {

        // Generate a new ephemeral key to use
        this.logger.info('Generating an ephemeral ssh key');
            
        let { publicKey, privateKey } = await util.promisify(crypto.generateKeyPair)('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
                // cipher: 'aes-256-cbc',
                // passphrase: ''
            }
        });

        return privateKey;
    }

    private async sendPubKeyFromIdentityFile(identityFile: string) {

        let pubKey = await this.extractPubKeyFromIdentityFile(identityFile);

        // key type and pubkey are space delimited in the resulting string
        // https://github.com/joyent/node-sshpk/blob/4342c21c2e0d3860f5268fd6fd8af6bdeddcc6fc/lib/formats/ssh.js#L99
        let keyString = pubKey.toString('ssh');
        let keyType = keyString.split(' ')[0];
        let sshPubKey = keyString.split(' ')[1];

        await this.sendAddSshPubKeyMessage({
            keyType: keyType,
            publicKey: sshPubKey
        });
    }

    private async extractPubKeyFromIdentityFile(identityFileName: string): Promise<SshPK.Key> {
        let identityFile = await this.readIdentityFile(identityFileName);

        // Use ssh-pk library to convert the public key to ssh RFC 4716 format
        // https://stackoverflow.com/a/54406021/9186330
        // https://github.com/joyent/node-sshpk/blob/4342c21c2e0d3860f5268fd6fd8af6bdeddcc6fc/lib/key.js#L234
        return SshPK.parseKey(identityFile, 'auto');
    }

    private async readIdentityFile(identityFileName: string): Promise<string> {
        return util.promisify(fs.readFile)(identityFileName, 'utf8');
    }

    public async sendDataMessage(data: Buffer) {
        // this.logger.debug('Outgoing message >>>> ' + data.toString('utf8'));
        let base64EncData = data.toString('base64');
        let dataMessage: TunnelDataMessage = {
            data: base64EncData
        };

        await this.sendWebsocketMessage<TunnelDataMessage>('SendData', dataMessage);
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

    private sendStartTunnelMessage(startTunnelMessage: StartTunnelMessage) {
        return this.sendWebsocketMessage<StartTunnelMessage>(
            'StartTunnel', 
            startTunnelMessage
        );
    }

    private sendAddSshPubKeyMessage(addSshPubKeyMessage: AddSshPubKeyMessage) {
        return this.sendWebsocketMessage<AddSshPubKeyMessage>(
            'AddSshPubKey',
            addSshPubKeyMessage
        );
    }

    private async sendWebsocketMessage<T>(methodName: string, message: T) {
        if(this.websocket.state == HubConnectionState.Disconnected)
            throw new Error('Hub disconnected');

        await this.websocket.invoke(methodName, message);
    }
    
    private async closeConnection() {
        if(this.websocket) {
            await this.websocket.stop();
            this.websocket = undefined;
        }
    }

    private parseTargetIdFromHost(host: string): string {
        let prefix = 'bzero-';

        if(! host.startsWith(prefix)) {
            this.logger.error(`Invalid host provided must have form ${prefix}<targetId>`);
            throw Error('Invalid host');
        }

        let targetId = host.substr(prefix.length);

        // TODO: Validate the targetId. We may want to do more then just check
        // for a valid guid and also check that this target exists when listing
        // ssm targets

        return targetId;
    }
}