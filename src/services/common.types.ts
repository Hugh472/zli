import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';

export interface TargetUser
{
    userName: string;
}

export enum IdP {
    Google = 'Google',
    Microsoft = 'Microsoft'
}

export enum TargetStatus {
    NotActivated = 'NotActivated',
    Offline = 'Offline',
    Online = 'Online',
    Terminated = 'Terminated',
    Error = 'Error'
}

export interface TargetSummary extends TargetBase
{
    agentVersion: string;
    targetUsers: string[];
    type: TargetType;
}

export interface TargetBase
{
    id: string;
    status: TargetStatus;
    name: string;
    environmentId: string;
}

export interface ParsedTargetString
{
    type: TargetType;
    user: string;
    id: string;
    name: string;
    path: string;
    envId: string;
    envName: string;
}