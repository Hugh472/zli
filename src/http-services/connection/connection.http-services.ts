import { CreateShellConnectionRequest} from '../../../webshell-common-ts/http/v2/connection/requests/create-connection.request';
import { CreateConnectionResponse } from '../../../webshell-common-ts/http/v2/connection/responses/create-connection.responses';
import { ConnectionSummary } from '../../../webshell-common-ts/http/v2/connection/types/connection-summary.types';
import { ShellConnectionAuthDetails } from '../../../webshell-common-ts/http/v2/connection/types/shell-connection-auth-details.types';
import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class ConnectionHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/connections/', logger);
    }

    public GetConnection(connectionId: string) : Promise<ConnectionSummary>
    {
        return this.Get(connectionId);
    }

    public async CreateConnection(targetType: TargetType, targetId: string, sessionId: string, targetUser: string) : Promise<string>
    {
        const req : CreateShellConnectionRequest = {
            spaceId: sessionId,
            targetId: targetId,
            targetType: targetType,
            targetUser: targetUser
        };

        const resp = await this.Post<CreateShellConnectionRequest, CreateConnectionResponse>('shell', req);

        return resp.connectionId;
    }

    public CloseConnection(connectionId: string) : Promise<void>
    {
        return this.Patch(`${connectionId}/close`);
    }

    public async GetShellConnectionAuthDetails(connectionId: string) : Promise<ShellConnectionAuthDetails>
    {
        return this.Get(`${connectionId}/shell-auth-details`);
    }
}