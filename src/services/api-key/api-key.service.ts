import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { ApiKeyDetails, DeleteApiKeyRequest, NewApiKeyRequest, NewApiKeyResponse } from './api-key.types';

export class ApiKeyService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v1/ApiKey', logger);
    }

    public ListAllApiKeys(): Promise<ApiKeyDetails[]> {
        return this.Post('list', {});
    }

    public createNewApiKey(request: NewApiKeyRequest) : Promise<NewApiKeyResponse> {
        return this.Post('new', request);
    }

    public deleteApiKey(request: DeleteApiKeyRequest) : Promise<void> {
        return this.Post('delete', request);
    }
}