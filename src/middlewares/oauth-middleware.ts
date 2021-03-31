import { OAuthService } from '../oauth.service/oauth.service';
import { ConfigService } from '../config.service/config.service';
import { Logger } from '../../src/logger.service/logger';

export async function oauthMiddleware(configService: ConfigService, logger: Logger) : Promise<void> {

    let ouath = new OAuthService(configService, logger);

    let tokenSet = configService.tokenSet();

    // decide if we need to refresh or prompt user for login
    if(tokenSet)
    {
        if(configService.tokenSet().expired)
        {
            logger.debug('Refreshing oauth');

            // refresh using existing creds
            await ouath.refresh()
                .then((newTokenSet) => configService.setTokenSet(newTokenSet))
                // Catch oauth related errors
                .catch((err) => {
                    logger.error(err);
                    logger.error('Stale log in detected');
                    logger.info('You need to log in, please run \'zli login --help\'');
                    configService.logout();
                    process.exit(1);
                })
        }
    } else {
        logger.warn('You need to log in, please run \'zli login --help\'');
        process.exit(1);
    }
}