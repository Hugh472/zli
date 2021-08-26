import { AuthorizationParameters, Client, custom, errors, generators, Issuer, TokenSet, UserinfoResponse } from 'openid-client';
import open from 'open';
import { IDisposable } from '../../../webshell-common-ts/utility/disposable';
import { ConfigService } from '../config/config.service';
import http, { RequestListener } from 'http';
import { setTimeout } from 'timers';
import { Logger } from '../logger/logger.service';
import { loginHtml } from './templates/login';
import { logoutHtml } from './templates/logout';
import { cleanExit } from '../../handlers/clean-exit.handler';
import { parse as QueryStringParse } from 'query-string';

export class OAuthService implements IDisposable {
    private server: http.Server; // callback listener
    private host: string = 'localhost';
    private logger: Logger;

    constructor(private configService: ConfigService, logger: Logger) {
        this.logger = logger;
    }

    private setupCallbackListener(
        client: Client,
        codeVerifier: string,
        callback: (tokenSet: TokenSet) => void,
        onListen: () => void,
        resolve: (value?: void | PromiseLike<void>) => void,
        expectedNonce?: string
    ): void {

        const requestListener: RequestListener = async (req, res) => {
            res.writeHead(200, { 'content-type': 'text/html' });

            // Example of request url string
            // /login-callback?param=...
            const urlParts = req.url.split('?');
            const queryParams = QueryStringParse(urlParts[1]);

            // example of failed login attempt
            // http://localhost:3000/login-callback?error=consent_required&error_description=AADSTS65004%3a+User+decline...
            if(!! queryParams.error)
            {
                this.logger.error('User login failed: ' + queryParams.error);
                this.logger.info('Please try logging in again');
                await cleanExit(1, this.logger);
            }

            switch (urlParts[0]) {
            case '/login-callback':
                const params = client.callbackParams(req);

                const tokenSet = await client.callback(
                    `http://${this.host}:${this.configService.callbackListenerPort()}/login-callback`,
                    params,
                    { code_verifier: codeVerifier, nonce: expectedNonce });

                this.logger.info('Login successful');
                this.logger.debug('callback listener closed');

                // write to config with callback
                callback(tokenSet);
                this.server.close();
                res.write(loginHtml);
                resolve();
                break;

            case '/logout-callback':
                this.logger.info('Login successful');
                this.logger.debug('callback listener closed');
                this.server.close();
                res.write(logoutHtml);
                resolve();
                break;

            default:
                this.logger.debug(`Unhandled callback at: ${req.url}`);
                break;
            }
        };

        this.logger.debug(`Setting up callback listener at http://${this.host}:${this.configService.callbackListenerPort()}/`);
        this.server = http.createServer(requestListener);
        // Port binding failure will produce error event
        this.server.on('error', async () => {
            this.logger.error('Log in listener could not bind to port');
            this.logger.warn(`Please make sure port ${this.configService.callbackListenerPort()} is open/whitelisted`);
            this.logger.warn('To edit callback port please run: \'zli config\'');
            await cleanExit(1, this.logger);
        });
        // open browser after successful port binding
        this.server.on('listening', onListen);
        this.server.listen(this.configService.callbackListenerPort(), this.host, () => {});
    }

    // The client will make the log-in requests with the following parameters
    private async getClient(): Promise<Client>
    {
        const authority = await Issuer.discover(this.configService.authUrl());
        const client = new authority.Client({
            client_id: this.configService.clientId(),
            redirect_uris: [`http://${this.host}:${this.configService.callbackListenerPort()}/login-callback`],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_basic',
            client_secret: this.configService.clientSecret()
        });

        // set clock skew
        // ref: https://github.com/panva/node-openid-client/blob/77d7c30495df2df06c407741500b51498ba61a94/docs/README.md#customizing-clock-skew-tolerance
        client[custom.clock_tolerance] = 5 * 60; // 5 minute clock skew allowed for verification

        return client;
    }

    private getAuthUrl(client: Client, code_challenge: string, nonce?: string) : string
    {
        const authParams: AuthorizationParameters = {
            client_id: this.configService.clientId(), // This one gets put in the queryParams
            response_type: 'code',
            code_challenge: code_challenge,
            code_challenge_method: 'S256',
            scope: this.configService.authScopes(),
            // required for google refresh token
            prompt: 'consent',
            access_type: 'offline',
            nonce: nonce
        };

        return client.authorizationUrl(authParams);
    }

    public isAuthenticated(): boolean
    {
        const tokenSet = this.configService.tokenSet();

        if(tokenSet === undefined)
            return false;

        return !tokenSet.expired();
    }

    public login(callback: (tokenSet: TokenSet) => void, nonce?: string): Promise<void>
    {
        return new Promise<void>(async (resolve, reject) => {
            setTimeout(() => reject(this.logger.error('Login timeout reached')), 60 * 1000);

            const client = await this.getClient();
            const code_verifier = generators.codeVerifier();
            const code_challenge = generators.codeChallenge(code_verifier);

            const openBrowser = async () => await open(this.getAuthUrl(client, code_challenge, nonce));
            this.setupCallbackListener(client, code_verifier, callback, openBrowser, resolve, nonce);
        });
    }

    public async refresh(): Promise<TokenSet>
    {
        const client = await this.getClient();
        const tokenSet = this.configService.tokenSet();
        const refreshToken = tokenSet.refresh_token;
        const refreshedTokenSet = await client.refresh(tokenSet);

        // In case of google the refreshed token is not returned in the refresh
        // response so we set it from the previous value
        if(! refreshedTokenSet.refresh_token)
            refreshedTokenSet.refresh_token = refreshToken;

        return refreshedTokenSet;
    }

    // If you need the token.sub this is where you can get it
    public async userInfo(): Promise<UserinfoResponse>
    {
        const client = await this.getClient();
        const tokenSet = this.configService.tokenSet();
        const userInfo = await client.userinfo(tokenSet);
        return userInfo;
    }

    // Returns the current OAuth idtoken. Refreshes it before returning if expired
    public async getIdToken(): Promise<string> {

        const tokenSet = this.configService.tokenSet();

        // decide if we need to refresh or prompt user for login
        if(tokenSet)
        {
            if(this.configService.tokenSet().expired())
            {
                try {
                    this.logger.debug('Refreshing oauth token');

                    const newTokenSet = await this.refresh();
                    this.configService.setTokenSet(newTokenSet);
                    this.logger.debug('Oauth token refreshed');
                } catch(e) {
                    if(e instanceof errors.RPError || e instanceof errors.OPError) {
                        this.logger.error('Stale log in detected');
                        this.logger.info('You need to log in, please run \'zli login --help\'');
                        this.configService.logout();
                        await cleanExit(1, this.logger);
                    } else {
                        this.logger.error('Unexpected error during oauth refresh');
                        this.logger.info('Please log in again');
                        this.configService.logout();
                        await cleanExit(1, this.logger);
                    }
                }
            }
        } else {
            this.logger.error('You need to log in, please run \'zli login --help\'');
            await cleanExit(1, this.logger);
        }

        return this.configService.getAuth();
    }

    dispose(): void {
        if(this.server)
        {
            this.server.close();
            this.server = undefined;
        }
    }
}