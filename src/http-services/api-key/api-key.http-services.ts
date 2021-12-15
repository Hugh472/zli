
import { NewApiKeyRequest } from 'http/v2/api-key/requests/new-api-key.request';
import { NewApiKeyResponse } from 'http/v2/api-key/responses/new-api-key.responses';
import { ApiKeySummary } from 'http/v2/api-key/types/api-key-summary.types';
import { HttpService } from 'services/http/http.service';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';

export class ApiKeyHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/api-keys', logger);
    }

    public ListAllApiKeys(): Promise<ApiKeySummary[]> {
        return this.Get();
    }

    public CreateNewApiKey(request: NewApiKeyRequest) : Promise<NewApiKeyResponse> {
        return this.Post('', request);
    }

    public DeleteApiKey(id: string) : Promise<void> {
        return this.Delete(id);
    }
}