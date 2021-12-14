import { CreateEnvironmentRequest } from "http/v2/environment/requests/create-environment.requests";
import { CreateEnvironmentResponse } from "http/v2/environment/responses/create-environment.responses";
import { EnvironmentSummary } from "http/v2/environment/types/environment-summary.responses";
import { ConfigService } from "services/config/config.service";
import { HttpService } from "services/http/http.service";
import { Logger } from "services/logger/logger.service";

export class EnvironmentHttpService extends HttpService {
    constructor(configService: ConfigService, logger: Logger) {
        super(configService, 'api/v2/environments/', logger);
    }

    public ListEnvironments(): Promise<EnvironmentSummary[]> {
        return this.Get();
    }

    public CreateEnvironment(req: CreateEnvironmentRequest): Promise<CreateEnvironmentResponse> {
        return this.Post<CreateEnvironmentRequest, CreateEnvironmentResponse>('', req);
    }

    public DeleteEnvironment(envId: string): Promise<void> {
        return this.Delete(envId);
    }
}