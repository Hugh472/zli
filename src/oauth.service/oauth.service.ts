import { User, UserManager, OidcClient, Log, OidcClientSettings, StateStore } from 'oidc-client';
import open from 'open';
import { IDisposable } from '../../webshell-common-ts/utility/disposable';
import { ConfigService } from '../config.service/config.service';
import http, { RequestListener } from 'http';
import { setTimeout } from 'timers';
import { Logger } from '../logger.service/logger';

const fs = require('fs');
const path = require('path');

// TODO: setting Oidc.Global.XMLHttpRequest not working
// const Window = require('window');
// const window = new Window();
// const global = require('oidc-client').Global;
// var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
// global.setXMLHttpRequest(new XMLHttpRequest());

// oidc-client expects xmlhttprequest to exist in browser environment but we
// must install it separately when running in nodejs environment
// https://stackoverflow.com/questions/32604460/xmlhttprequest-module-not-defined-found
global.XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

export class OAuthService implements IDisposable {
    private server: http.Server; // callback listener
    private host: string = 'localhost';
    private logger: Logger;

    constructor(private configService: ConfigService, logger: Logger) {
        this.logger = logger;

        // Set Oidc internal logger and log level
        // https://github.com/IdentityModel/oidc-client-js/wiki#logging
        Log.logger = this.logger;
        Log.level = Log.DEBUG;
    }

    private setupCallbackListener(
        client: OidcClient,
        callback: (tokenSet: User) => void,
        onListen: () => void,
        resolve: (value?: void | PromiseLike<void>) => void,
        expectedNonce?: string
    ): void {

        const requestListener: RequestListener = async (req, res) => {
            res.writeHead(200, { 'content-type': 'text/html' });

            switch (req.url.split('?')[0]) {
            case '/login-callback':
                const signinResponse = await client.processSigninResponse(req.url);

                this.logger.info(JSON.stringify(signinResponse));
                this.logger.info('Login successful');
                this.logger.debug('callback listener closed');

                // write to config with callback
                callback(new User(signinResponse as any));
                this.server.close();
                fs.createReadStream(path.join(__dirname, './templates/login.html')).pipe(res);
                resolve();
                break;

            case '/logout-callback':
                this.logger.info('Login successful');
                this.logger.debug('callback listener closed');
                fs.createReadStream(path.join(__dirname, './templates/logout.html')).pipe(res);
                resolve();
                break;

            default:
                // console.log(`default callback at: ${req.url}`);
                break;
            }
        };

        this.logger.debug(`Setting up callback listener at http://${this.host}:${this.configService.callbackListenerPort()}/`);
        this.server = http.createServer(requestListener);
        // Port binding failure will produce error event
        this.server.on('error', () => {
            this.logger.error('Log in listener could not bind to port');
            this.logger.warn(`Please make sure port ${this.configService.callbackListenerPort()} is open/whitelisted`);
            this.logger.warn('To edit callback port please run: \'zli config\'');
            process.exit(1);
        });
        // open browser after successful port binding
        this.server.on('listening', onListen);
        this.server.listen(this.configService.callbackListenerPort(), this.host, () => {});
    }

    private async getOidcSettings(nonce?: string) : Promise<OidcClientSettings> {
        let extraQueryParams: ExtraQueryParams = {
            // TODO condition this on provider?
            // this is needed in order for Google to give us the refresh token (ref:
            // https://developers.google.com/identity/protocols/oauth2/web-server#creatingclient)
            'access_type': 'offline',
        };

        if(nonce) {
            extraQueryParams['nonce'] = nonce
        }

        let oidcClientSettings = {
            authority: this.configService.authUrl(),
            client_id: this.configService.clientId(),
            client_secret: this.configService.clientSecret(),
            redirect_uri: `http://${this.host}:${this.configService.callbackListenerPort()}/login-callback`,
            response_type: 'code',
            scope: this.configService.authScopes(),
            extraQueryParams: extraQueryParams,
            // to enforce account selection and refresh token (ref:
            // https://stackoverflow.com/a/10857806/9727747)
            prompt: "consent",
            clockSkew: 5 * 60, // 5 minute clock skew allowed for verification
            stateStore: new CustomStateStore(),
        };

        return oidcClientSettings;
    }

    private async getOidcClient(nonce?: string): Promise<OidcClient>
    {
        let oidcClientSettings = await this.getOidcSettings(nonce);
        let client = new OidcClient(await this.getOidcSettings(nonce));

        // TODO: Figure out how to make this less awful
        // super hacky way to ensure XMLHttpRequest is set for all dependent services within OidcClient
        (client.metadataService as any)['_jsonService']['_XMLHttpRequest'] = global.XMLHttpRequest;
        (client as any)['_validator']['_tokenClient']['_jsonService']['_XMLHttpRequest'] = global.XMLHttpRequest;
        (client as any)['_validator']['_userInfoService']['_jsonService']['_XMLHttpRequest'] = global.XMLHttpRequest;

        return client;
    }

    private async getUserManager(nonce?: string): Promise<UserManager>
    {
        let extraQueryParams: ExtraQueryParams = {
            // TODO condition this on provider?
            // this is needed in order for Google to give us the refresh token (ref:
            // https://developers.google.com/identity/protocols/oauth2/web-server#creatingclient)
            'access_type': 'offline',
        };

        if(nonce) {
            extraQueryParams['nonce'] = nonce
        }

        let userManager = new UserManager({
            authority: this.configService.authUrl(),
            client_id: this.configService.clientId(),
            client_secret: this.configService.clientSecret(),
            redirect_uri: `http://${this.host}:${this.configService.callbackListenerPort()}/login-callback`,
            response_type: 'code',
            scope: this.configService.authScopes(),
            extraQueryParams: extraQueryParams,
            // to enforce account selection and refresh token (ref:
            // https://stackoverflow.com/a/10857806/9727747)
            prompt: "consent",
            clockSkew: 5 * 60, // 5 minute clock skew allowed for verification
            stateStore: new CustomStateStore(),
            userStore: new CustomUserStore(this.configService)
        });

        // TODO: Figure out how to make this less awful
        // super hacky way to ensure XMLHttpRequest is set for all dependent services within OidcClient
        (userManager as any)['_tokenClient']['_metadataService']['_jsonService']['_XMLHttpRequest'] = global.XMLHttpRequest;
        (userManager as any)['_tokenClient']['_jsonService']['_XMLHttpRequest'] = global.XMLHttpRequest;

        return userManager;
    }

    public isAuthenticated(): boolean
    {
        const tokenSet = this.configService.tokenSet();

        if(tokenSet === undefined)
            return false;

        return tokenSet.expired;
    }

    public login(callback: (tokenSet: User) => void, nonce?: string): Promise<void>
    {
        return new Promise<void>(async (resolve, reject) => {
            setTimeout(() => reject('Log in timeout reached'), 60 * 1000);
            try {
                let client = await this.getOidcClient(nonce);
                let signInRequest = await client.createSigninRequest();
                const openBrowser = async () => await open(signInRequest.url);
                this.setupCallbackListener(client, callback, openBrowser, resolve, nonce);
            } catch(err){
                reject(err);
            }
        });
    }

    public async refresh(): Promise<User>
    {
        let userManager = await this.getUserManager();
        let user = userManager.signinSilent();
        return user;
    }

    dispose(): void {
        if(this.server)
        {
            this.server.close();
            this.server = undefined;
        }
    }
}

interface ExtraQueryParams {
    access_type: string,
    nonce?: string
}

// TODO actually merge this with the configService store
class CustomUserStore implements StateStore {
    constructor(private configService: ConfigService) {}

    async set(key: string, value: any): Promise<void> {
        return;
    }

    async get(key: string): Promise<any> {
        return this.configService.tokenSet().toStorageString();
    }

    async remove(key: string): Promise<any> {
        return;
    }

    getAllKeys(): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
}
class CustomStateStore {
    private myState: { [key: string] : string } = {}

    async set(key: string, value: any): Promise<void> {
        this.myState[key] = value;
    }

    async get(key: string): Promise<any> {
        return this.myState[key];
    }

    async remove(key: string): Promise<any> {
        let value = this.myState[key];
        delete this.myState[key];
        return value;
    }

    async getAllKeys(): Promise<string[]> {
        return Object.keys(this.myState);
    }
}