import Conf from 'conf/dist/source';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { Logger } from '../logger/logger.service';
import { KeySplittingConfigSchema, ConfigInterface, getDefaultKeysplittingConfig } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service.types';
import path from 'path';
import { Observable, Subject } from 'rxjs';
import { DbConfig, getDefaultDbConfig } from '../db/db.service';
import { WebConfig, getDefaultWebConfig } from '../web/web.service';
import { TokenService } from '../v1/token/token.service';
import { UserSummary } from '../v1/user/user.types';
import { KubeConfig, getDefaultKubeConfig } from '../v1/kube/kube.service';
import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { TokenHttpService } from '../../http-services/token/token.http-services';


// refL: https://github.com/sindresorhus/conf/blob/master/test/index.test-d.ts#L5-L14
type BastionZeroConfigSchema = {
    authUrl: string,
    clientId: string,
    clientSecret: string,
    serviceUrl: string,
    tokenSet: TokenSetParameters,
    callbackListenerPort: number,
    GAToken: string,
    idp: IdentityProvider,
    sessionId: string,
    whoami: UserSummary,
    sshKeyPath: string
    keySplitting: KeySplittingConfigSchema,
    kubeConfig: KubeConfig
    dbConfig: DbConfig,
    webConfig: WebConfig
}

export class ConfigService implements ConfigInterface {
    private config: Conf<BastionZeroConfigSchema>;
    private configName: string;
    private tokenHttpService: TokenHttpService;
    private logoutDetectedSubject: Subject<boolean> = new Subject<boolean>();

    public logoutDetected : Observable<boolean> = this.logoutDetectedSubject.asObservable();

    constructor(configName: string, private logger: Logger, configDir?: string) {
        const projectName = 'bastionzero-zli';

        // If a custom configDir append the projectName to the path to keep
        // consistent behavior with conf so that different projectName's wont
        // overlap and use the same configuration file.
        if(configDir) {
            configDir = path.join(configDir, projectName);
        }

        const appName = this.getAppName(configName);
        this.configName = configName;
        this.config = new Conf<BastionZeroConfigSchema>({
            projectName: projectName,
            configName: configName, // prod, stage, dev,
            // if unset will use system default config directory
            // a custom value is only passed for system tests
            // https://github.com/sindresorhus/conf#cwd
            cwd: configDir,
            defaults: {
                authUrl: undefined,
                clientId: undefined,
                clientSecret: undefined,
                serviceUrl:  appName ? this.getServiceUrl(appName) : undefined,
                tokenSet: undefined, // tokenSet.expires_in is Seconds
                callbackListenerPort: 0, // if the port is 0, the oauth.service will ask the OS for available port
                GAToken: undefined,
                idp: undefined,
                sessionId: undefined,
                whoami: undefined,
                sshKeyPath: undefined,
                keySplitting: getDefaultKeysplittingConfig(),
                kubeConfig: getDefaultKubeConfig(),
                dbConfig: getDefaultDbConfig(),
                webConfig: getDefaultWebConfig()
            },
            accessPropertiesByDotNotation: true,
            clearInvalidConfig: true,    // if config is invalid, delete
            migrations: {
                // migrate old configs to have new serviceUrl
                '>4.3.0': (config: Conf<BastionZeroConfigSchema>) => {
                    if(appName)
                        config.set('serviceUrl', this.getServiceUrl(appName));
                }
            },
            watch: true
        });

        if(configName == 'dev' && ! this.config.get('serviceUrl')) {
            logger.error(`Config not initialized (or is invalid) for dev environment: Must set serviceUrl in: ${this.config.path}`);
            process.exit(1);
        }

        this.tokenHttpService = new TokenService(this, logger);

        this.config.onDidChange('tokenSet',
            (newValue : TokenSetParameters, oldValue : TokenSetParameters) => {
                // If the change in the tokenSet is a logout
                if (newValue === undefined && oldValue){
                    this.logoutDetectedSubject.next(true);
                }
            });
    }

    public updateKeySplitting(data: KeySplittingConfigSchema): void {
        this.config.set('keySplitting', data);
    }

    public loadKeySplitting(): KeySplittingConfigSchema {
        return this.config.get('keySplitting');
    }

    public removeKeySplitting(): void {
        this.config.delete('keySplitting');
    }

    public getConfigName() {
        return this.configName;
    }

    public configPath(): string {
        return this.config.path;
    }

    public GAToken(): string {
        return this.config.get('GAToken');
    }

    public callbackListenerPort(): number {
        return this.config.get('callbackListenerPort');
    }

    public serviceUrl(): string {
        return this.config.get('serviceUrl');
    }

    public authUrl(): string {
        return this.config.get('authUrl');
    }

    public tokenSet(): TokenSet {
        const tokenSet = this.config.get('tokenSet');
        return tokenSet && new TokenSet(tokenSet);
    }

    public idp(): IdentityProvider {
        return this.config.get('idp');
    }

    public clientId(): string {
        return this.config.get('clientId');
    }

    public clientSecret(): string {
        return this.config.get('clientSecret');
    }

    public authScopes(): string {
        return this.config.get('authScopes');
    }

    public getAuthHeader(): string {
        return `${this.tokenSet().token_type} ${this.tokenSet().id_token}`;
    }

    public getAuth(): string {
        return this.tokenSet().id_token;
    }

    public sessionId(): string {
        return this.config.get('sessionId');
    }

    public setSessionId(sessionId: string): void {
        this.config.set('sessionId', sessionId);
    }

    public setTokenSet(tokenSet: TokenSet): void {
        // TokenSet implements TokenSetParameters, makes saving it like
        // this safe to do.
        if(tokenSet)
            this.config.set('tokenSet', tokenSet);
    }

    public me(): UserSummary
    {
        const whoami = this.config.get('whoami');
        if (whoami) {
            return whoami;
        } else {
            throw new Error('User information is missing. You need to log in, please run \'zli login --help\'');
        }
    }

    public setMe(me: UserSummary): void {
        this.config.set('whoami', me);
    }

    public sshKeyPath() {
        if(! this.config.get('sshKeyPath'))
            this.config.set('sshKeyPath', path.join(path.dirname(this.config.path), 'bzero-temp-key'));

        return this.config.get('sshKeyPath');
    }

    public logout(): void
    {
        this.config.delete('tokenSet');
        this.config.delete('keySplitting');
    }

    public async fetchGAToken() {
        // fetch GA token from backend
        const GAToken = await this.getGAToken();
        this.config.set('GAToken', GAToken);
    }

    public async loginSetup(idp: IdentityProvider, email?: string): Promise<void> {
        // Common login setup
        this.config.set('idp', idp);
        this.config.set('authScopes', this.getAuthScopes(idp));

        // IdP specific login setup
        if (idp == IdentityProvider.Google || idp == IdentityProvider.Microsoft) {
            const clientSecret = await this.tokenHttpService.getClientIdAndSecretForProvider(idp);
            this.config.set('clientId', clientSecret.clientId);
            this.config.set('clientSecret', clientSecret.clientSecret);
            this.config.set('authUrl', this.getCommonAuthUrl(idp));
        } else if(idp == IdentityProvider.Okta) {
            if(! email)
                throw new Error('User email is required for logging in with okta');

            const oktaClientResponse = await this.tokenHttpService.getOktaClient(email);
            if(! oktaClientResponse)
                throw new Error(`Unknown organization for email ${email}`);

            this.config.set('clientId', oktaClientResponse.clientId);
            this.config.delete('clientSecret');
            this.config.set('authUrl', `${oktaClientResponse.domain}`);
        } else {
            throw new Error(`Unhandled idp ${idp} in loginSetup`);
        }

        // Clear previous login information
        this.config.delete('sessionId');
        this.config.delete('whoami');
    }

    public getKubeConfig() {
        return this.config.get('kubeConfig');
    }

    public getDbConfig() {
        return this.config.get('dbConfig');
    }

    public getWebConfig() {
        return this.config.get('webConfig');
    }

    public getBastionUrl() {
        return this.config.get('serviceUrl');
    }

    public setKubeConfig(kubeConfig: KubeConfig) {
        this.config.set('kubeConfig', kubeConfig);
    }

    public setDbConfig(dbConfig: DbConfig) {
        this.config.set('dbConfig', dbConfig);
    }

    public setWebConfig(webConfig: WebConfig) {
        this.config.set('webConfig', webConfig);
    }

    private getAppName(configName: string) {
        switch(configName)
        {
        case 'prod':
            return 'cloud';
        case 'stage':
            return 'cloud-staging';
        case 'dev':
            return 'cloud-dev';
        default:
            return undefined;
        }
    }

    private getServiceUrl(appName: string) {

        return `https://${appName}.bastionzero.com/`;
    }

    private getCommonAuthUrl(idp: IdentityProvider) {
        switch(idp)
        {
        case IdentityProvider.Google:
            return 'https://accounts.google.com';
        case IdentityProvider.Microsoft:
            return 'https://login.microsoftonline.com/common/v2.0';
        default:
            throw new Error(`Unhandled idp ${idp} in getCommonAuthUrl`);
        }
    }

    private getAuthScopes(idp: IdentityProvider) {
        switch(idp)
        {
        case IdentityProvider.Google:
            return 'openid email profile';
        case IdentityProvider.Microsoft:
            // both openid and offline_access must be set for refresh token
            return 'offline_access openid email profile';
        case IdentityProvider.Okta:
            return 'offline_access openid email profile';
        default:
            throw new Error(`Unknown idp ${idp}`);
        }
    }

    private async getGAToken(): Promise<string> {
        // return (await this.tokenHttpService.getGAToken()).token;
        return "UA-216204125-3";
    }
}
