import { CreateSpaceRequest } from '../../../webshell-common-ts/http/v2/space/requests/create-space.requests';
import { CreateSpaceResponse } from '../../../webshell-common-ts/http/v2/space/responses/create-space.responses';
import { SpaceSummary } from '../../../webshell-common-ts/http/v2/space/types/space-summary.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class SpaceHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/spaces/', logger);
    }

    public GetSpace(spaceId: string) : Promise<SpaceSummary>
    {
        return this.Get(spaceId);
    }

    public ListSpaces() : Promise<SpaceSummary[]>
    {
        return this.Get();
    }

    public async CreateSpace(displayName : string) : Promise<string>
    {
        const req : CreateSpaceRequest = {displayName, connectionsToOpen: []};

        const resp = await this.Post<CreateSpaceRequest, CreateSpaceResponse>('', req);

        return resp.spaceId;
    }

    public CloseSpace(spaceId: string) : Promise<void>
    {
        return this.Patch(`${spaceId}/close`);
    }
}