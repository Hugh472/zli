import { AuthorizationParameters, Client, ClientMetadata, custom, errors, generators, Issuer, TokenSet } from 'openid-client';
import open from 'open';
import { IDisposable } from '../../../webshell-common-ts/utility/disposable';
import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { ConfigService } from '../config/config.service';
import http, { RequestListener } from 'http';
import { setTimeout } from 'timers';
import { Logger } from '../logger/logger.service';
import { loginHtml } from './templates/login';
import { logoutHtml } from './templates/logout';
import { cleanExit } from '../../handlers/clean-exit.handler';
import { parse as QueryStringParse } from 'query-string';
import { parseIdpType, randomAlphaNumericString } from '../../utils/utils';
import { check as checkTcpPort } from 'tcp-port-used';
import { RefreshTokenError, UserNotLoggedInError } from './oauth.service.types';

// Do not remove any of these, clients have integrations set up based on these!
const callbackPorts: number[] = [49172, 51252, 58243, 59360, 62109];

export class OAuthService implements IDisposable {
    private server: http.Server; // callback listener
    private host: string = 'localhost';
    private logger: Logger;
    private oidcClient: Client;
    private codeVerifier: string;
    private nonce: string;
    private state: string;

    constructor(private configService: ConfigService, logger: Logger) {
        this.logger = logger;
    }

    private setupCallbackListener(
        callbackPort: number,
        callback: (tokenSet: TokenSet) => void,
        onListen: () => void,
        resolve: (value?: void | PromiseLike<void>) => void
    ): void {

        const requestListener: RequestListener = async (req, res) => {
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
            case '/webapp-callback':
                // Prepare config for a new login
                const provider = parseIdpType(queryParams.idp as IdentityProvider);
                const email = queryParams.email as string;

                if(provider === undefined) {
                    this.logger.error('The selected identity provider is not currently supported.');
                    await cleanExit(1, this.logger);
                }

                try {
                    await this.configService.loginSetup(provider, email);

                    // Setup the oidc client for a new login
                    await this.setupClient(callbackPort);
                    this.codeVerifier = generators.codeVerifier();

                    // While state is not strictly required to be set per the
                    // oidc spec when using PKCE flow, it is specifically
                    // required by okta and will fail if left empty. So we
                    // implement sending a random value in the state for all
                    // providers
                    // https://github.com/panva/node-openid-client/issues/377
                    // https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/#flow-specifics
                    this.state = randomAlphaNumericString(45);
                    const code_challenge = generators.codeChallenge(this.codeVerifier);

                    // Redirect to the idp
                    res.writeHead(302, {
                        'Access-Control-Allow-Origin': '*',
                        'content-type': 'text/html',
                        'Location': this.getAuthUrl(code_challenge, this.state)
                    });
                    res.end();
                } catch(err) {
                    this.logger.error(`Error occurred when trying to login with ${provider}. ${err.message}.`);
                    await cleanExit(1, this.logger);
                }

                break;

            case '/login-callback':
                if(this.oidcClient === undefined){
                    throw new Error('Unable to parse idp response with undefined OIDC client');
                }

                if(this.codeVerifier === undefined){
                    throw new Error('Unable to parse idp response with undefined code verifier');
                }

                if(this.nonce === undefined){
                    throw new Error('Unable to parse idp response with undefined nonce');
                }

                const params = this.oidcClient.callbackParams(req);

                const tokenSet = await this.oidcClient.callback(
                    `http://${this.host}:${callbackPort}/login-callback`,
                    params,
                    { code_verifier: this.codeVerifier, nonce: this.nonce, state: this.state });

                this.logger.info('Login successful');
                this.logger.debug('callback listener closed');

                // write to config with callback
                callback(tokenSet);
                this.server.close();
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'content-type': 'text/html'
                });
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

        this.logger.debug(`Setting up callback listener at http://${this.host}:${callbackPort}/`);
        this.server = http.createServer(requestListener);
        // Port binding failure will produce error event
        this.server.on('error', async (err) => {
            this.logger.error(`Error occurred in spawning callback server: ${err}`);
            await cleanExit(1, this.logger);
        });
        // open browser after successful port binding
        this.server.on('listening', onListen);
        this.server.listen(callbackPort, this.host, () => { });
    }

    private async setupClient(callbackPort? : number): Promise<void>
    {
        const authority = await Issuer.discover(this.configService.authUrl());

        const clientMetadata : ClientMetadata = {
            client_id: this.configService.clientId(),
            response_types: ['code'],
        };

        // Client secret is not used for okta but it is required for google/microsoft
        // https://github.com/panva/node-openid-client/blob/main/docs/README.md#client-authentication-methods
        const clientSecret = this.configService.clientSecret();
        if(clientSecret) {
            clientMetadata.client_secret = clientSecret;
            clientMetadata.token_endpoint_auth_method =  'client_secret_basic';
        } else {
            clientMetadata.token_endpoint_auth_method = 'none';
        }

        if (callbackPort) {
            clientMetadata.redirect_uris = [`http://${this.host}:${callbackPort}/login-callback`];
        }
        const client = new authority.Client(clientMetadata);

        // set clock skew
        // ref: https://github.com/panva/node-openid-client/blob/77d7c30495df2df06c407741500b51498ba61a94/docs/README.md#customizing-clock-skew-tolerance
        client[custom.clock_tolerance] = 5 * 60; // 5 minute clock skew allowed for verification

        this.oidcClient = client;
    }

    private getAuthUrl(code_challenge: string, state: string) : string
    {
        if(this.oidcClient === undefined){
            throw new Error('Unable to get authUrl from undefined OIDC client');
        }

        if(this.nonce === undefined){
            throw new Error('Unable to get authUrl from with undefined nonce');
        }

        const authParams: AuthorizationParameters = {
            client_id: this.configService.clientId(), // This one gets put in the queryParams
            response_type: 'code',
            code_challenge: code_challenge,
            code_challenge_method: 'S256',
            scope: this.configService.authScopes(),
            // required for google refresh token
            prompt: 'consent',
            access_type: 'offline',
            nonce: this.nonce,
            state: state
        };

        return this.oidcClient.authorizationUrl(authParams);
    }

    public isAuthenticated(): boolean
    {
        const tokenSet = this.configService.tokenSet();

        if(tokenSet === undefined)
            return false;

        return ! this.isIdTokenExpired(tokenSet);
    }

    private isIdTokenExpired(tokenSet: TokenSet): boolean
    {
        const nowUnixEpochTime = Math.floor(Date.now() / 1000);
        const bufferMinutes = 5;
        return nowUnixEpochTime + 60 * bufferMinutes >= tokenSet.claims().exp;
    }

    public async login(callback: (tokenSet: TokenSet) => void, nonce?: string): Promise<void> {
        const portToCheck = this.configService.callbackListenerPort();
        let portToUse : number = undefined;
        // If no port has been set by user
        if (portToCheck == 0) {
            // Find open port
            for (const port of callbackPorts) {
                if (! await checkTcpPort(port, this.host)) {
                    portToUse = port;
                    break;
                }
            }

            if ( portToUse === undefined){
                this.logger.error(`Log in listener could not bind to any of the default ports ${callbackPorts}`);
                this.logger.warn(`Please make sure either of ports ${callbackPorts} is open/whitelisted`);
                this.logger.warn('To set a custom callback port please run: \'zli configure\' and change \'callbackListenerPort\' in your config file');
                await cleanExit(1, this.logger);
            }

        } else {
            // User supplied custom port in configuration
            // Check to see if the port is in use and fail early if we
            // cannot bind
            const isPortInUse = await checkTcpPort(portToCheck, this.host);
            if (isPortInUse) {
                this.logger.error(`Log in listener could not bind to port ${portToCheck}`);
                this.logger.warn(`Please make sure port ${portToCheck} is open/whitelisted`);
                this.logger.warn('To edit callback port please run: \'zli configure\' and change \'callbackListenerPort\' in your config file');
                await cleanExit(1, this.logger);
            } else {
                portToUse = portToCheck;
            }
        }

        this.nonce = nonce;
        return new Promise<void>(async (resolve, reject) => {
            setTimeout(() => reject('Login timeout reached'), 60 * 1000);

            const openBrowser = async () => await open(`${this.configService.serviceUrl()}authentication/login?zliLogin=true&port=${portToUse}`);

            this.setupCallbackListener(portToUse, callback, openBrowser, resolve);
        });
    }

    public async refresh(): Promise<TokenSet>
    {
        await this.setupClient();
        const tokenSet = this.configService.tokenSet();
        const refreshToken = tokenSet.refresh_token;
        const refreshedTokenSet = await this.oidcClient.refresh(tokenSet);

        // In case of google the refreshed token is not returned in the refresh
        // response so we set it from the previous value
        if(! refreshedTokenSet.refresh_token)
            refreshedTokenSet.refresh_token = refreshToken;

        return refreshedTokenSet;
    }

    /**
     * Get the current user's id_token. Refresh it if it has expired.
     * @returns The current user's id_token
     */
    public async getIdToken(): Promise<string> {
        const tokenSet = this.configService.tokenSet();

        // Refresh if the token exists and has expired
        if (tokenSet) {
            if (this.isIdTokenExpired(tokenSet)) {
                this.logger.debug('Refreshing oauth token');

                let newTokenSet: TokenSet;
                try {
                    newTokenSet = await this.refresh();
                } catch (e) {
                    this.logger.debug(`Refresh Token Error: ${e.message}`);
                    if (e instanceof errors.RPError || e instanceof errors.OPError) {
                        throw new RefreshTokenError();
                    } else {
                        throw e;
                    }
                }

                this.configService.setTokenSet(newTokenSet);
                this.logger.debug('Oauth token refreshed');
            }
        } else {
            throw new UserNotLoggedInError();
        }

        return this.configService.getAuth();
    }

    /**
     * Get the current user's id_token. Refresh it if it has expired. This
     * function will exit the running process if any error occurs or if the user
     * is not logged in (i.e. tokenSet not found in config).
     * @returns The current OIDC id_token
     */
    public async getIdTokenAndExitOnError(): Promise<string> {
        let idToken: string;
        try {
            idToken = await this.getIdToken();
        } catch (e) {
            this.logger.debug(`Get id token error: ${e.message}`);
            if (e instanceof RefreshTokenError) {
                this.logger.error('Stale log in detected');
                this.logger.info('You need to log in, please run \'zli login --help\'');
                this.configService.logout();
                await cleanExit(1, this.logger);
            } else if (e instanceof UserNotLoggedInError) {
                this.logger.error('You need to log in, please run \'zli login --help\'');
                await cleanExit(1, this.logger);
            } else {
                this.logger.error('Unexpected error during oauth refresh');
                this.logger.info('Please log in again');
                this.configService.logout();
                await cleanExit(1, this.logger);
            }
        }

        return idToken;
    }

    dispose(): void {
        if(this.server)
        {
            this.server.close();
            this.server = undefined;
        }
    }
}