import { OAuthService } from '../oauth.service/oauth.service';
import { ConfigService } from '../config.service/config.service';
import { Logger } from '../../src/logger.service/logger';

export async function oauthMiddleware(configService: ConfigService, logger: Logger) : Promise<void> {

    const oauth = new OAuthService(configService, logger);

    await oauth.getIdToken();
}