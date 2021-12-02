export interface ApiKeyDetails {
    id: string;
    name: string;
    timeCreated: Date;
}

export interface NewApiKeyRequest {
    name: string;
    isRegistrationKey: boolean;
}

export interface NewApiKeyResponse {
    apiKeyDetails : ApiKeyDetails;
    secret: string;
}

export interface DeleteApiKeyRequest {
    id: string;
}