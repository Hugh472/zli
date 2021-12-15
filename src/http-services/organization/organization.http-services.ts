import { IdentityProvider } from 'auth-service/auth.types';
import { IdentityProviderGroupsMetadataResponse } from 'http/v2/organization/responses/identity-provider-groups-metadata.responses';
import { GroupSummary } from 'http/v2/organization/types/group-summary.types';
import { Dictionary } from 'lodash';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

const MicrosoftAdminScopes = ['User.Read.All', 'Group.Read.All'];

export class OrganizationHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/organization/', logger);
    }

    public ListGroups(): Promise<GroupSummary[]>
    {
        const extraHeaders: Dictionary<string> = {};

        // TODO CWC-1144: This can be removed once microsoft uses the same flow
        // as google for IdP groups integration with a backend access token

        // For microsoft IdP check if we have acquired admin scopes in the odic
        // token set. If we have then we can send the access token as an http
        // header to the backend to be used to query the Microsoft Graph API for
        // fetching group information
        if(this.configService.idp() === IdentityProvider.Microsoft) {
            const tokenSet = this.configService.tokenSet();
            const scopes = tokenSet.scope.split(' ');
            const adminConsentAcquired = MicrosoftAdminScopes.every(scope => scopes.includes(scope));

            if(adminConsentAcquired) {
                const accessToken = tokenSet.access_token;

                if(accessToken) {
                    extraHeaders['AccessToken'] = accessToken;
                } else {
                    this.logger.warn('No access token in token set cannot fetch microsoft groups');
                }
            }
        }

        return this.Get('groups', {}, extraHeaders);
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