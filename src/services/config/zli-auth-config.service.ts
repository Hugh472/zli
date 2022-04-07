import { AuthConfigService } from '../../../webshell-common-ts/auth-config-service/auth-config.service';
import { ConfigService } from './config.service';
import { Logger } from '../logger/logger.service';
import { OAuthService } from '../oauth/oauth.service';

export class ZliAuthConfigService implements AuthConfigService {

    private oauth: OAuthService;
    private static readonly SESSION_ID_COOKIE_NAME: string = 'sessionId';
    private static readonly SESSION_TOKEN_COOKIE_NAME: string = 'sessionToken';

    constructor(
        private configService: ConfigService,
        private logger: Logger
    )
    {
        this.oauth = new OAuthService(this.configService, this.logger);
    }

    // This is only being used for the signalR hubs that are not versioned yet
    getServiceUrl() {
        return this.configService.serviceUrl() + 'api/v1/';
    }

    getSessionId() {
        return this.configService.getSessionId();
    }

    getSessionIdCookieName() {
        return ZliAuthConfigService.SESSION_ID_COOKIE_NAME;
    }

    getSessionToken() {
        return this.configService.getSessionToken();
    }

    getSessionTokenCookieName() {
        return ZliAuthConfigService.SESSION_TOKEN_COOKIE_NAME;
    }

    async getIdToken() {
        return await this.oauth.getIdTokenAndExitOnError();
    }
}