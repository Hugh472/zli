import { UserRegisterResponse } from '../../../webshell-common-ts/http/v2/user/responses/user-resgister.responses';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class UserHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/users/', logger);
    }

    public Register(): Promise<UserRegisterResponse>
    {
        return this.Post('register', {});
    }

    public Me(): Promise<UserSummary>
    {
        return this.Get('me');
    }

    public ListUsers(): Promise<UserSummary[]>
    {
        return this.Get();
    }

    public GetUserByEmail(
        email: string
    ): Promise<UserSummary>
    {
        return this.Get(email);
    }
}