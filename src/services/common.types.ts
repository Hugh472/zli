import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';

export interface TargetUser
{
    userName: string;
}

export enum IdP {
    Google = 'Google',
    Microsoft = 'Microsoft'
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