import Conf from 'conf/dist/source';
import { TokenSet, TokenSetParameters } from 'openid-client';
import { Logger } from '../logger/logger.service';
import { KeySplittingConfigSchema, ConfigInterface, getDefaultKeysplittingConfig } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service.types';
import path from 'path';
import { Observable, Subject } from 'rxjs';
import { IdP } from '../common.types';
import { ClientSecretResponse } from '../token/token.messages';
import { TokenService } from '../token/token.service';
import { UserSummary } from '../user/user.types';

export interface KubeConfig {
    keyPath: string,
    certPath: string,
    token: string,
    localHost: string,
    localPort: number,
    localPid: number,
    assumeRole: string,
    assumeCluster: string,
}

// refL: https://github.com/sindresorhus/conf/blob/master/test/index.test-d.ts#L5-L14
type BastionZeroConfigSchema = {
    authUrl: string,
    clientId: string,
    clientSecret: string,
    serviceUrl: string,
    tokenSet: TokenSetParameters,
    callbackListenerPort: number,
    mixpanelToken: string,
    idp: IdP,
    sessionId: string,
    whoami: UserSummary,
    sshKeyPath: string
    keySplitting: KeySplittingConfigSchema,
    kubeConfig: KubeConfig
}

export class ConfigService implements ConfigInterface {
    private config: Conf<BastionZeroConfigSchema>;
    private configName: string;
    private tokenService: TokenService;
    private logoutDetectedSubject: Subject<boolean> = new Subject<boolean>();

    public logoutDetected : Observable<boolean> = this.logoutDetectedSubject.asObservable();

    constructor(configName: string, logger: Logger) {
        const appName = this.getAppName(configName);
        this.configName = configName;
        this.config = new Conf<BastionZeroConfigSchema>({
            projectName: 'bastionzero-zli',
            configName: configName, // prod, stage, dev
            defaults: {
                authUrl: undefined,
                clientId: undefined,
                clientSecret: undefined,
                serviceUrl:  appName ? this.getServiceUrl(appName) : undefined,
                tokenSet: undefined, // tokenSet.expires_in is Seconds
                callbackListenerPort: 3000,
                mixpanelToken: undefined,
                idp: undefined,
                sessionId: undefined,
                whoami: undefined,
                sshKeyPath: undefined,
                keySplitting: getDefaultKeysplittingConfig(),
                kubeConfig: undefined
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

        if(! this.config.get('sshKeyPath'))
            this.config.set('sshKeyPath', path.join(path.dirname(this.config.path), 'bzero-temp-key'));

        this.tokenService = new TokenService(this, logger);

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

    public mixpanelToken(): string {
        return this.config.get('mixpanelToken');
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

    // private until we have a reason to expose to app
    public idp(): IdP {
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
        return this.config.get('whoami');
    }

    public setMe(me: UserSummary): void {
        this.config.set('whoami', me);
    }

    public sshKeyPath() {
        return this.config.get('sshKeyPath');
    }

    public logout(): void
    {
        this.config.delete('tokenSet');
        this.config.delete('keySplitting');
    }

    public async loginSetup(idp: IdP): Promise<void>
    {
        this.config.set('idp', idp);
        this.config.set('authUrl', this.getAuthUrl(idp));
        this.config.set('authScopes', this.getAuthScopes(idp));

        // fetch oauth details and mixpanel token from backend on login
        const clientSecret = await this.getOAuthClient(idp);
        this.config.set('clientId', clientSecret.clientId);
        this.config.set('clientSecret', clientSecret.clientSecret);

        const mixpanelToken = await this.getMixpanelToken();
        this.config.set('mixpanelToken', mixpanelToken);

        // Clear previous sessionId
        this.config.delete('sessionId');
        this.config.delete('whoami');
    }

    public getKubeConfig() {
        return this.config.get('kubeConfig');
    }

    public setKubeConfig(kubeConfig: KubeConfig) {
        this.config.set('kubeConfig', kubeConfig);
    }

    private getAppName(configName: string) {
        switch(configName)
        {
        case 'prod':
            return 'cloud';
        case 'stage':
            return 'cloud-staging';
        default:
            return undefined;
        }
    }

    private getServiceUrl(appName: string) {

        return `https://${appName}.bastionzero.com/`;
    }

    private getAuthUrl(idp: IdP) {
        switch(idp)
        {
        case IdP.Google:
            return 'https://accounts.google.com';
        case IdP.Microsoft:
            return 'https://login.microsoftonline.com/common/v2.0';
        default:
            throw new Error(`Unknown idp ${idp}`);
        }
    }

    private getAuthScopes(idp: IdP) {
        switch(idp)
        {
        case IdP.Google:
            return 'openid email profile';
        case IdP.Microsoft:
            // both openid and offline_access must be set for refresh token
            return 'offline_access openid email profile';
        default:
            throw new Error(`Unknown idp ${idp}`);
        }
    }

    private getOAuthClient(idp: IdP): Promise<ClientSecretResponse> {
        return this.tokenService.GetClientSecret(idp);
    }

    private async getMixpanelToken(): Promise<string> {
        return (await this.tokenService.GetMixpanelToken()).token;
    }
}