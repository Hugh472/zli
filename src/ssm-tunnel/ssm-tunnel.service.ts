import util from 'util';
import crypto from 'crypto';
import fs from 'fs';

import SshPK from 'sshpk';
import { Observable, Subject } from 'rxjs';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';

import { Logger } from '../logger.service/logger';
import { ConfigService } from '../config.service/config.service';
import { AddSshPubKeyMessage, StartTunnelMessage, TunnelDataMessage, WebsocketResponse } from './ssm-tunnel.types';
import { SsmTargetService } from '../http.service/http.service';


export class SsmTunnelService
{
    private websocket : HubConnection;
    private errorSubject: Subject<string> = new Subject<string>();
    public errors: Observable<string> = this.errorSubject.asObservable();

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
    ) : Promise<boolean> {
        try {
            let targetId = await this.parseTargetIdFromHost(hostName);

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

            return true;
        } catch(err) {
            this.handleError(`Failed to setup tunnel: ${err.message}`);
            return false;
        }
    }

    public async sendDataMessage(data: Buffer, sequenceNumber: number) {
        let base64EncData = data.toString('base64');
        let dataMessage: TunnelDataMessage = {
            data: base64EncData,
            sequenceNumber: sequenceNumber
        };

        try {
            await this.sendWebsocketMessage<TunnelDataMessage>('SendData', dataMessage);
        } catch(err) {
            this.handleError(err);
        }
    }

    public async closeConnection() {
        if(this.websocket) {
            await this.websocket.stop();
            this.websocket = undefined;
        }
    }

    private async setupWebsocket() {
        await this.startWebsocket();

        this.websocket.onclose((error) => {
            this.handleError(`Websocket was closed by server: ${error}`);
        });

        this.websocket.on('ReceiveData', (dataMessage: TunnelDataMessage) => {
            try {
                let buf = Buffer.from(dataMessage.data, 'base64');

                this.logger.debug(`received tunnel data message with sequence number ${dataMessage.sequenceNumber}`);

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
                format: 'pem'
            }
        });

        return privateKey;
    }

    private async sendPubKeyFromIdentityFile(identityFile: string) {
        let pubKey = await this.extractPubKeyFromIdentityFile(identityFile);

        // key type and pubkey are space delimited in the resulting string
        // https://github.com/joyent/node-sshpk/blob/4342c21c2e0d3860f5268fd6fd8af6bdeddcc6fc/lib/formats/ssh.js#L99
        let [keyType, sshPubKey] = pubKey.toString('ssh').split(' ');

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

    private async sendStartTunnelMessage(startTunnelMessage: StartTunnelMessage) {
        await this.sendWebsocketMessage<StartTunnelMessage>(
            'StartTunnel',
            startTunnelMessage
        );
    }

    private async sendAddSshPubKeyMessage(addSshPubKeyMessage: AddSshPubKeyMessage) {
        await this.sendWebsocketMessage<AddSshPubKeyMessage>(
            'AddSshPubKey',
            addSshPubKeyMessage
        );
    }

    private async sendWebsocketMessage<T>(methodName: string, message: T) {
        if(this.websocket === undefined || this.websocket.state == HubConnectionState.Disconnected)
            throw new Error('Hub disconnected');

        let response = await this.websocket.invoke<WebsocketResponse>(methodName, message);

        // Handle Hub Error
        if(response.error) {
            throw new Error(response.errorMessage);
        }
    }

    private async handleError(errorMessage: string) {
        this.logger.error(errorMessage);
        this.errorSubject.next(errorMessage);
    }

    private async parseTargetIdFromHost(host: string): Promise<string> {
        let prefix = 'bzero-';

        if(! host.startsWith(prefix)) {
            throw new Error(`Invalid host provided must have form ${prefix}<targetId>`);
        }

        let targetId = host.substr(prefix.length);

        const ssmTargetService = new SsmTargetService(this.configService, this.logger);
        let ssmTargets = await ssmTargetService.ListSsmTargets();

        if(! ssmTargets.some(t => t.id == targetId)) {
            throw new Error(`No ssm target exists with id ${targetId}`);
        }

        return targetId;
    }
}