import { CreateConnectionRequest } from 'http/v2/connection/requests/create-connection.request';
import { CreateConnectionResponse } from 'http/v2/connection/responses/create-connection.responses';
import { ConnectionSummary } from 'http/v2/connection/types/connection-summary.types';
import { ConnectionType } from 'http/v2/connection/types/connection.types';
import { ShellConnectionAuthDetails } from 'http/v2/connection/types/shell-connection-auth-details.types';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

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

    public async CreateConnection(targetType: ConnectionType, targetId: string, sessionId: string, targetUser: string) : Promise<string>
    {
        const req : CreateConnectionRequest = {
            spaceId: sessionId,
            targetId: targetId,
            connectionType: targetType,
            targetUser: targetUser
        };

        const resp = await this.Post<CreateConnectionRequest, CreateConnectionResponse>('', req);

        return resp.connectionId;
    }

    public CloseConnection(connectionId: string) : Promise<void>
    {
        return this.Patch(`${connectionId}/close`);
    }

    public async GetShellConnectionAuthDetails(connectionId: string) : Promise<ShellConnectionAuthDetails>
    {
        return this.Get(`${connectionId}/auth-details`);
    }
}