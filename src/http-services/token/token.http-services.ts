import { IdentityProvider } from '../../../webshell-common-ts/auth-service/auth.types';
import { ClientSecretResponse } from '../../../webshell-common-ts/http/v2/token/responses/client-secret.responses';
import { GATokenResponse } from '../../../webshell-common-ts/http/v2/token/responses/GA-token.responses';
import { OktaClientResponse } from '../../../webshell-common-ts/http/v2/token/responses/okta-client.responses';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class TokenHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/token/', logger, false);
    }

    public getGAToken(): Promise<GATokenResponse>
    {
        return this.Get('GA-token', {});
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