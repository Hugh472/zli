import { IdentityProviderGroupsMetadataResponse } from '../../../webshell-common-ts/http/v2/organization/responses/identity-provider-groups-metadata.responses';
import { GroupSummary } from '../../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

export class OrganizationHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/organization/', logger);
    }

    public ListGroups(): Promise<GroupSummary[]>
    {
        return this.Get('groups', {});
    }

    public FetchGroups(): Promise<GroupSummary[]>
    {
        return this.Post('groups/fetch', {});
    }

    public GetCredentialsMetadata(): Promise<IdentityProviderGroupsMetadataResponse>
    {
        return this.Get('groups/credentials');
    }
}