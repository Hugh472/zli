export interface GetKubeUnregisteredAgentYamlResponse {
    yaml: string;
}

export interface GetKubeUnregisteredAgentYamlRequest {
    name: string;
    labels: { [index: string ]: string };
    namespace: string;
    environmentId: string;
}

export interface GetUserInfoResponse {
    email: string;
    id: string;
}

export interface GetUserInfoRequest{
    email: string;
}

export interface DeleteClusterRequest {
    id: string;
};