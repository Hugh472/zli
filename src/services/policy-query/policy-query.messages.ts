import { TargetUser, TargetType } from '../common.types';
import { PolicySummary } from '../policy/policy.types';
import { Verb } from './policy-query.types';

export interface GetTargetPolicyResponse
{
    allowed: boolean;
    allowedTargetUsers: TargetUser[];
    allowedVerbs: Verb[]
}

export interface GetTargetPolicyRequest
{
    targetId: string;
    targetType: TargetType;
    verb?: Verb;
    targetUser?: TargetUser;
}

export interface KubeProxyResponse {
    allowed: boolean;
}

export interface DbConnectResponse {
    allowed: boolean;
}
export interface WebConnectResponse {
    allowed: boolean;
}

export interface KubeProxyRequest {
    clusterId: string;
    targetUser: string;
    targetGroups: string[];
}

export interface DbConnectRequest {
    targetId: string;
    targetHost: string;
    targetPort: number;
    targetHostName: string;
}

export interface WebConnectRequest {
    targetId: string;
    targetHost: string;
    targetPort: number;
    targetHostName: string;
}

export interface GetAllPoliciesForClusterIdResponse {
    policies: PolicySummary[]
}

export interface GetAllPoliciesForClusterIdRequest {
    clusterId: string;
}