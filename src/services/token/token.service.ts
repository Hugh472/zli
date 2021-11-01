import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { MixpanelTokenResponse, ClientSecretResponse, OktaClientResponse } from './token.messages';

export class TokenService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v1/token/', logger, '', false);
    }

    public getMixpanelToken(): Promise<MixpanelTokenResponse>
    {
        return this.Get('mixpanel-token', {});
    }

    public getClientIdAndSecretForProvider(idp: IdentityProvider) : Promise<ClientSecretResponse>
    {
        return this.Get(`${idp.toLowerCase()}-client`, {});
    }

    public getOktaClient(userEmail: string) : Promise<OktaClientResponse> {
        return this.Get('okta-client', {
            email: userEmail
        });
    }
}