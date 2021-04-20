import { AuthConfigService } from '../../webshell-common-ts/auth-config-service/auth-config.service';
import { ConfigService } from './config.service';
import { Logger } from '../logger.service/logger';
import { OAuthService } from '../../src/oauth.service/oauth.service';

export class ZliAuthConfigService implements AuthConfigService {

    constructor(
        private configService: ConfigService,
        private logger: Logger
    )
    {}

    getServiceUrl() {
        return this.configService.serviceUrl() + 'api/v1/';
    }

    getSessionId() {
        return this.configService.sessionId();
    }

    async getIdToken() {
        const oauth = new OAuthService(this.configService, this.logger);
        return oauth.getIdToken();
    }
}