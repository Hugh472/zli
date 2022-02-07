import Table from 'cli-table3';
import fs from 'fs';
import { concat, filter, map, max } from 'lodash';
import { WebTargetSummary } from '../../webshell-common-ts/http/v2/target/web/web-target-summary.types';
import { DbTargetSummary } from '../../webshell-common-ts/http/v2/target/db/db-target-summary.types';
import util from 'util';
import { IdentityProvider } from '../../webshell-common-ts/auth-service/auth.types';
import { cleanExit } from '../handlers/clean-exit.handler';
import { ParsedTargetString } from '../services/common.types';
import { TargetSummary } from '../../webshell-common-ts/http/v2/target/targetSummary.types';
import { KubeConfig } from '../services/v1/kube/kube.service';
import { Logger } from '../services/logger/logger.service';
import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';
import { TargetStatus } from '../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { TargetBase } from '../../webshell-common-ts/http/v2/target/types/targetBase.types';
import { EnvironmentSummary } from '../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { ConnectionSummary } from '../../webshell-common-ts/http/v2/connection/types/connection-summary.types';
import { UserSummary } from '../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { KubernetesPolicySummary } from '../../webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { TargetConnectPolicySummary } from '../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { OrganizationControlsPolicySummary } from '../../webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { SessionRecordingPolicySummary } from '../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { PolicyType } from '../../webshell-common-ts/http/v2/policy/types/policy-type.types';
import { SubjectType } from '../../webshell-common-ts/http/v2/common.types/subject.types';
import { GroupSummary } from '../../webshell-common-ts/http/v2/organization/types/group-summary.types';
import { SsmTargetSummary } from '../../webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { DynamicAccessConfigSummary } from '../../webshell-common-ts/http/v2/target/dynamic/types/dynamic-access-config-summary.types';
import { ApiKeySummary } from '../../webshell-common-ts/http/v2/api-key/types/api-key-summary.types';
import { WebConfig } from '../services/web/web.service';
import { DbConfig } from '../services/db/db.service';
import { KubeClusterSummary } from '../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { ProxyPolicySummary } from '../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { Group } from '../../webshell-common-ts/http/v2/policy/types/group.types';
import { WebTargetService } from '../http-services/web-target/web-target.http-service';
import { DbTargetService } from '../http-services/db-target/db-target.http-service';
import { ConfigService } from '../services/config/config.service';
import { listDbTargets, listWebTargets } from './list-utils';


// case insensitive substring search, 'find targetString in searchString'
export function findSubstring(targetString: string, searchString: string) : boolean
{
    return searchString.toLowerCase().indexOf(targetString.toLowerCase()) !== -1;
}

export const targetStringExample : string = '[targetUser@]<targetId-or-targetName>';

export function parseTargetType(targetType: string) : TargetType
{
    const connectionTypePattern = /^(ssmtarget|dynamicaccessconfig|cluster)$/i; // case insensitive check for targetType

    if(! connectionTypePattern.test(targetType))
        return undefined;

    switch (targetType.toLowerCase()) {
    case TargetType.SsmTarget.toLowerCase():
        return TargetType.SsmTarget;
    case TargetType.DynamicAccessConfig.toLowerCase():
        return TargetType.DynamicAccessConfig;
    case TargetType.Cluster.toLowerCase():
        return TargetType.Cluster;
    default:
        return undefined;
    }
}

export function parsePolicyType(policyType: string) : PolicyType
{
    const policyTypePattern = /^(targetconnect|organizationcontrols|sessionrecording|kubernetes|proxy)$/i; // case insensitive check for policyType

    if(! policyTypePattern.test(policyType))
        return undefined;

    switch (policyType.toLowerCase()) {
    case PolicyType.Kubernetes.toLowerCase():
        return PolicyType.Kubernetes;
    case PolicyType.OrganizationControls.toLowerCase():
        return PolicyType.OrganizationControls;
    case PolicyType.SessionRecording.toLowerCase():
        return PolicyType.SessionRecording;
    case PolicyType.TargetConnect.toLowerCase():
        return PolicyType.TargetConnect;
    case PolicyType.Proxy.toLowerCase():
        return PolicyType.Proxy;
    default:
        return undefined;
    }
}

export function parseIdpType(idp: IdentityProvider) : IdentityProvider
{
    switch (idp) {
    case IdentityProvider.Google:
        return IdentityProvider.Google;
    case IdentityProvider.Microsoft:
        return IdentityProvider.Microsoft;
    case IdentityProvider.Okta:
        return IdentityProvider.Okta;
    default:
        return undefined;
    }
}

export function parseTargetStatus(targetStatus: string) : TargetStatus {
    switch (targetStatus.toLowerCase()) {
    case TargetStatus.NotActivated.toLowerCase():
        return TargetStatus.NotActivated;
    case TargetStatus.Offline.toLowerCase():
        return TargetStatus.Offline;
    case TargetStatus.Online.toLowerCase():
        return TargetStatus.Online;
    case TargetStatus.Terminated.toLowerCase():
        return TargetStatus.Terminated;
    case TargetStatus.Error.toLowerCase():
        return TargetStatus.Error;
    default:
        return undefined;
    }
}

export function parseTargetString(targetString: string) : ParsedTargetString
{
    // case sensitive check for [targetUser@]<targetId | targetName>[:targetPath]
    const pattern = /^([a-z_]([a-z0-9_-]{0,31}|[a-z0-9_-]{0,30}\$)@)?(([0-9A-Fa-f]{8}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{12})|([a-zA-Z0-9_.-]{1,255}))(:{1}|$)/;

    if(! pattern.test(targetString))
        return undefined;

    const result : ParsedTargetString = {
        type: undefined,
        user: undefined,
        id: undefined,
        name: undefined,
        path: undefined,
        envId: undefined,
        envName: undefined
    };

    let atSignSplit = targetString.split('@', 2);

    // if targetUser@ is present, extract username
    if(atSignSplit.length == 2)
    {
        result.user = atSignSplit[0];
        atSignSplit = atSignSplit.slice(1);
    }

    // extract targetId and maybe targetPath
    const colonSplit = atSignSplit[0].split(':', 2);
    const targetSomething = colonSplit[0];

    // test if targetSomething is GUID
    if(isGuid(targetSomething))
        result.id = targetSomething;
    else
        result.name = targetSomething;

    if(colonSplit[1] !== '')
        result.path = colonSplit[1];

    return result;
}

// Checks whether the passed argument is a valid Guid
export function isGuid(id: string): boolean{
    const guidPattern = /^[0-9A-Fa-f]{8}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{12}$/;
    return guidPattern.test(id);
}

export function getTableOfTargets(targets: TargetSummary[], envs: EnvironmentSummary[], showDetail: boolean = false, showGuid: boolean = false) : string
{
    // The following constant numbers are set specifically to conform with the specified 80/132 cols term size - do not change
    const targetNameLength = max(targets.map(t => t.name.length)) + 2 || 16; // || 16 here means that when there are no targets default the length to 16
    const envNameLength = max(envs.map(e => e.name.length)) + 2 < 16 ? 16 : max(envs.map(e => e.name.length));
    const targetTypeLength = max(targets.map(t => t.type.length)) + 2;

    const header: string[] = ['Type', 'Name', 'Environment'];
    const columnWidths = [];
    if (!showDetail) {
        columnWidths.push(targetTypeLength);
        columnWidths.push(targetNameLength > 44 ? 44 : targetNameLength);
        columnWidths.push(envNameLength > 47 ? 47 : envNameLength);
    } else {
        columnWidths.push(targetTypeLength);
        columnWidths.push(targetNameLength > 32 ? 32 : targetNameLength);
        columnWidths.push(envNameLength > 31 ? 31 : envNameLength);
    }

    if(showGuid)
    {
        header.push('Id');
        columnWidths.push(38);
    }

    if(showDetail)
    {
        header.push('Agent Version', 'Status', 'Target Users', 'Region');
        columnWidths.push(15, 9, 29, 18);
    }

    // ref: https://github.com/cli-table/cli-table3
    const table = new Table({ head: header, colWidths: columnWidths });

    targets.forEach(target => {
        let env = target.environmentId;
        if (env != 'N/A') {
            env = envs.filter(e => e.id == target.environmentId).pop().name;
        }

        const row = [target.type, target.name, env];

        if(showGuid) {
            row.push(target.id);
        }

        if(showDetail) {
            row.push(target.agentVersion);
            row.push(target.status || 'N/A'); // status is undefined for non-SSM targets
            row.push(map(target.targetUsers).join(', \n') || 'N/A'); // targetUsers are undefined for now for non-cluster targets
            row.push(target.region);
        }

        table.push(row);
    }
    );

    return table.toString();
}

export function getTableOfConnections(connections: ConnectionSummary[], allTargets: TargetSummary[]) : string
{
    const connIdLength = max(connections.map(c => c.id.length).concat(36));
    const targetUserLength = max(connections.map(c => c.targetUser.length).concat(16));
    const targetNameLength = max(allTargets.map(t => t.name.length).concat(16));
    const header: string[] = ['Connection ID', 'Target User', 'Target', 'Time Created'];
    const columnWidths = [connIdLength + 2, targetUserLength + 2, targetNameLength + 2, 20];

    const table = new Table({ head: header, colWidths: columnWidths });
    const dateOptions = {year: '2-digit', month: 'numeric', day: 'numeric', hour:'numeric', minute:'numeric', hour12: true};
    connections.forEach(connection => {
        const row = [connection.id, connection.targetUser, allTargets.filter(t => t.id == connection.targetId).pop().name, new Date(connection.timeCreated).toLocaleString('en-US', dateOptions as any)];
        table.push(row);
    });

    return table.toString();

}

export function getTableOfUsers(users: UserSummary[]) : string
{
    const nameLength = max(users.map(u => u.fullName.length).concat(16));
    const emailLength = max(users.map(u => u.email.length).concat(36));
    const header: string[] = ['Name', 'Email', 'Role', 'Last Login'];
    const columnWidths = [nameLength + 2, emailLength + 2, 7, 20];

    const table = new Table({ head: header, colWidths: columnWidths });
    const dateOptions = {year: '2-digit', month: 'numeric', day: 'numeric', hour:'numeric', minute:'numeric', hour12: true};
    users.forEach(u => {
        const row = [u.fullName, u.email, u.isAdmin ? 'Admin' : 'User', new Date(u.lastLogin).toLocaleString('en-US', dateOptions as any)];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfGroups(groups: GroupSummary[]) : string
{
    const nameLength = max(groups.map(g => g.name.length).concat(16));
    const header: string[] = ['Group Name'];
    const columnWidths = [nameLength + 2];

    const table = new Table({ head: header, colWidths: columnWidths });
    groups.forEach(g => {
        const row = [g.name];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfTargetUsers(targetUsers: string[]): string {
    return getTableOfTargetObject(targetUsers, 'Allowed Target Users');
}

export function getTableOfTargetGroups(targetUsers: string[]): string {
    return getTableOfTargetObject(targetUsers, 'Allowed Target Groups');
}

export function getTableOfTargetObject(targetUsers: string[], headerString: string) : string
{
    const header: string[] = [headerString];
    const nameLength = max(targetUsers.map(u => u.length).concat(16));
    // If the title's length is bigger than the longer user use that as the row length
    const rowLength = nameLength > header[0].length ? nameLength : header[0].length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: header, colWidths: columnWidths });
    targetUsers.forEach(u => {
        const row = [u];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfKubeStatus(kubeConfig: KubeConfig) : string
{
    const title: string = 'Kube Daemon Running';
    const values = [`Target Cluster: ${kubeConfig['targetCluster']}`, `Target User: ${kubeConfig['targetUser']}`, `Target Group: ${kubeConfig['targetGroups'].join(',')}`, `Local URL: ${kubeConfig['localHost']}:${kubeConfig['localPort']}`];

    const valuesLength = max(values.map(s => s.length).concat(16));

    // If the title's length is bigger than the longer user use that as the row length (0 index is the longest header)
    const rowLength = valuesLength > title.length ? valuesLength : title.length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: [title], colWidths: columnWidths });
    values.forEach( value => {
        table.push([value]);
    });

    return table.toString();
}

export function getTableOfWebStatus(webConfig: WebConfig) : string
{
    const title: string = 'Web Daemon Running';
    const values = [`Target Name: ${webConfig['name']}`, `Local URL: ${webConfig['localHost']}:${webConfig['localPort']}`];

    const valuesLength = max(values.map(s => s.length).concat(16));

    // If the title's length is bigger than the longer user use that as the row length (0 index is the longest header)
    const rowLength = valuesLength > title.length ? valuesLength : title.length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: [title], colWidths: columnWidths });
    values.forEach( value => {
        table.push([value]);
    });

    return table.toString();
}

export function getTableOfDbStatus(dbConfig: DbConfig) : string
{
    const title: string = 'Db Daemon Running';
    const values = [`Target Name: ${dbConfig['name']}`, `Local URL: ${dbConfig['localHost']}:${dbConfig['localPort']}`];

    const valuesLength = max(values.map(s => s.length).concat(16));

    // If the title's length is bigger than the longer user use that as the row length (0 index is the longest header)
    const rowLength = valuesLength > title.length ? valuesLength : title.length;
    const columnWidths = [rowLength + 2];

    const table = new Table({ head: [title], colWidths: columnWidths });
    values.forEach( value => {
        table.push([value]);
    });

    return table.toString();
}

export function getTableOfDescribeCluster(kubernetesPolicies: KubernetesPolicySummary[]) : string {
    const header: string[] = ['Policy', 'Target Users', 'Target Group'];

    const policyLength = max(kubernetesPolicies.map(p => p.name.length).concat(16));
    const targetUserLength = max(kubernetesPolicies.map(p => p.clusterUsers.length).concat(16));
    const targetGroupLength = max(kubernetesPolicies.map(p => p.clusterGroups.length).concat(16));

    const columnWidths = [policyLength + 2, targetUserLength + 4, targetGroupLength + 4];


    const table = new Table({ head: header, colWidths: columnWidths });
    kubernetesPolicies.forEach(p => {
        const formattedTargetUsers = p.clusterUsers.map((u: any) => u.name).join(', \n');
        const formattedTargetGroups = p.clusterGroups.map((g: any) => g.name).join(', \n');
        const row = [p.name, formattedTargetUsers, formattedTargetGroups];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfKubernetesPolicies(
    kubernetesPolicies: KubernetesPolicySummary[],
    userMap: {[id: string]: UserSummary},
    apiKeyMap: {[id: string]: ApiKeySummary},
    environmentMap: {[id: string]: EnvironmentSummary},
    targetMap : {[id: string]: string},
    groupMap : {[id: string]: GroupSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    kubernetesPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach((group: any) => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach((subject: any) => {
            switch (subject.type) {
            case SubjectType.ApiKey:
                subjectNames.push('ApiKey:' + getApiKeyName(subject.id, apiKeyMap));
                break;
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        // Translate the resource ids to human readable resources
        let formattedResource = '';
        let formattedTargetUsers = '';
        let formattedTargetGroup = '';

        if (p.environments) {
            const environmentNames : string [] = [];
            p.environments.forEach(
                (env: any) => environmentNames.push(getEnvironmentName(env.id, environmentMap))
            );
            formattedResource = 'Environments: ' + environmentNames.join( ', \n');
        } else if (p.clusters) { // Alternatively if this policy gets applied straight on some clusters
            const clusterNames : string [] = [];
            p.clusters.forEach(
                (c: any) => clusterNames.push(getTargetName(c.id, targetMap))
            );
            formattedResource = 'Clusters: ' + clusterNames.join( ', \n');
        }

        if (p.clusterUsers) {
            const clusterUsersNames : string [] = [];
            p.clusterUsers.forEach(
                (cu: any) => clusterUsersNames.push(cu.name)
            );
            formattedTargetUsers = 'Cluster Users: ' + clusterUsersNames.join(', \n');
        }

        if (p.clusterGroups) {
            const clusterGroupsName: string[] = [];
            p.clusterGroups.forEach(
                (cg: any) => clusterGroupsName.push(cg.name)
            );
            formattedTargetGroup = 'Cluster Groups: ' + clusterGroupsName.join(', \n');
        }

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            formattedResource || 'N/A',
            formattedTargetUsers || 'N/A',
            formattedTargetGroup || 'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfTargetConnectPolicies(
    targetConnectPolicies: TargetConnectPolicySummary[],
    userMap: {[id: string]: UserSummary},
    apiKeyMap: {[id: string]: ApiKeySummary},
    environmentMap: {[id: string]: EnvironmentSummary},
    targetMap : {[id: string]: string},
    groupMap : {[id: string]: GroupSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    targetConnectPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.ApiKey:
                subjectNames.push('ApiKey:' + getApiKeyName(subject.id, apiKeyMap));
                break;
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        // Translate the resource ids to human readable resources
        let formattedResource = '';
        let formattedTargetUsers = '';
        const formattedTargetGroup = '';

        if (p.environments) {
            const environmentNames : string [] = [];
            p.environments.forEach(
                env => environmentNames.push(getEnvironmentName(env.id, environmentMap))
            );
            formattedResource = 'Environments: ' + environmentNames.join( ', \n');
        } else if (p.targets) { // Alternatively if this policy gets applied straight on some targets
            const targetNames : string [] = [];
            p.targets.forEach(
                t => targetNames.push(getTargetName(t.id, targetMap))
            );
            formattedResource = 'Targets: ' + targetNames.join( ', \n');
        }

        if (p.targetUsers) {
            const targetUsersNames : string [] = [];
            p.targetUsers.forEach(
                tu => targetUsersNames.push(tu.userName)
            );
            formattedTargetUsers = 'Unix Users: ' + targetUsersNames.join(', \n');
        }

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            formattedResource || 'N/A',
            formattedTargetUsers || 'N/A',
            formattedTargetGroup || 'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfOrganizationControlPolicies(
    organizationControlsPolicies: OrganizationControlsPolicySummary[],
    userMap: {[id: string]: UserSummary},
    apiKeyMap: {[id: string]: ApiKeySummary},
    groupMap : {[id: string]: GroupSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    organizationControlsPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.ApiKey:
                subjectNames.push('ApiKey:' + getApiKeyName(subject.id, apiKeyMap));
                break;
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            'N/A',
            'N/A',
            'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfProxyPolicies(
    proxyPolicies: ProxyPolicySummary[],
    userMap: {[id: string]: UserSummary},
    apiKeyMap: {[id: string]: ApiKeySummary},
    groupMap : {[id: string]: GroupSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject'];
    const columnWidths = [24, 19, 26];

    const table = new Table({ head: header, colWidths: columnWidths });
    proxyPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach((group: Group) => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.ApiKey:
                subjectNames.push('ApiKey:' + getApiKeyName(subject.id, apiKeyMap));
                break;
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
        ];
        table.push(row);
    });

    return table.toString();
}

export function getTableOfSessionRecordingPolicies(
    sessionRecordingPolicies: SessionRecordingPolicySummary[],
    userMap: {[id: string]: UserSummary},
    apiKeyMap: {[id: string]: ApiKeySummary},
    groupMap : {[id: string]: GroupSummary}
) : string
{
    const header: string[] = ['Name', 'Type', 'Subject', 'Resource', 'Target Users', 'Target Group'];
    const columnWidths = [24, 19, 26, 28, 29];

    const table = new Table({ head: header, colWidths: columnWidths });
    sessionRecordingPolicies.forEach(p => {

        // Translate the policy subject ids to human readable subjects
        const groupNames : string [] = [];
        p.groups.forEach(group => {
            groupNames.push(getGroupName(group.id, groupMap));
        });
        const formattedGroups = !! groupNames.length ? 'Groups: ' + groupNames.join( ', \n') : '';

        const subjectNames : string [] = [];
        p.subjects.forEach(subject => {
            switch (subject.type) {
            case SubjectType.ApiKey:
                subjectNames.push('ApiKey:' + getApiKeyName(subject.id, apiKeyMap));
                break;
            case SubjectType.User:
                subjectNames.push(getUserName(subject.id, userMap));
                break;
            default:
                break;
            }
        });
        let formattedSubjects = subjectNames.join( ', \n');
        if (subjectNames.length > 0 && !!formattedGroups) {
            formattedSubjects += '\n';
        }
        formattedSubjects += formattedGroups;

        const row = [
            p.name,
            p.type,
            formattedSubjects || 'N/A',
            'N/A',
            'N/A',
            'N/A'
        ];
        table.push(row);
    });

    return table.toString();
}

function getApiKeyName(apiKeyId: string, apiKeyMap: {[id: string]: ApiKeySummary}) : string {
    return apiKeyMap[apiKeyId]
        ? apiKeyMap[apiKeyId].name
        : 'API KEY DELETED';
}

function getUserName(userId: string, userMap: {[id: string]: UserSummary}) : string {
    return userMap[userId]
        ? userMap[userId].fullName
        : 'USER DELETED';
}

function getEnvironmentName(envId: string, environmentMap: {[id: string]: EnvironmentSummary}) : string {
    return environmentMap[envId]
        ? environmentMap[envId].name
        : 'ENVIRONMENT DELETED';
}

function getTargetName(targetId: string, targetMap: {[id: string]: string}) : string {
    return targetMap[targetId]
        ? targetMap[targetId]
        : 'TARGET DELETED';
}

function getGroupName(groupId: string, groupMap: {[id: string]: GroupSummary}) : string {
    return groupMap[groupId]
        ? groupMap[groupId].name
        : 'GROUP DELETED';
}

// Interface that we can use to compare target info between TargetsSummary, DbTargetSummary, WebTargetSummary
interface CommonTargetInfo extends TargetBase {
    type: TargetType;
}

// Figure out target id based on target name and target type.
// Also preforms error checking on target type and target string passed in
export async function disambiguateTarget(
    targetTypeString: string,
    targetString: string,
    logger: Logger,
    dynamicConfigs: Promise<TargetSummary[]>,
    ssmTargets: Promise<TargetSummary[]>,
    clusterTargets: Promise<KubeClusterSummary[]>,
    envs: Promise<EnvironmentSummary[]>,
    configService: ConfigService): Promise<ParsedTargetString> {

    // First query for our web + db targets as we no longer pre-fetch
    const dbTargets = await listDbTargets(logger, configService);
    const webTargets = await listWebTargets(logger, configService);

    const parsedTarget = parseTargetString(targetString);

    if(! parsedTarget) {
        return undefined;
    }

    let zippedShellTargetsUnformatted = concat(await ssmTargets, await dynamicConfigs);

    // Filter out Error and Terminated SSM targets
    zippedShellTargetsUnformatted = filter(zippedShellTargetsUnformatted, t => t.type !== TargetType.SsmTarget || (t.status !== TargetStatus.Error && t.status !== TargetStatus.Terminated));

    // Now cast everything to a common target info object
    const zippedTargetsShell: CommonTargetInfo[] = [];
    zippedShellTargetsUnformatted.forEach((targetSummary: TargetSummary) => {
        const newVal: CommonTargetInfo = {
            name: targetSummary.name,
            id: targetSummary.id,
            type: targetSummary.type,
            status: targetSummary.status,
            environmentId: targetSummary.environmentId,
            region: targetSummary.region,
            agentVersion: targetSummary.agentVersion
        };
        zippedTargetsShell.push(newVal);
    });

    // Now create similar lists for the other types of targets, db, web
    const zippedTargetsDb: CommonTargetInfo[] = [];
    const awaitedDbTarget = await dbTargets;
    awaitedDbTarget.forEach((targetSummary: DbTargetSummary) => {
        const newVal: CommonTargetInfo = {
            name: targetSummary.name,
            id: targetSummary.id,
            type: TargetType.Db,
            status: targetSummary.status,
            environmentId: targetSummary.environmentId,
            region: targetSummary.region,
            agentVersion: targetSummary.agentVersion
        };
        zippedTargetsDb.push(newVal);
    });

    const zippedTargetsWeb: CommonTargetInfo[] = [];
    const awaitedWebTarget = await webTargets;
    awaitedWebTarget.forEach((targetSummary: WebTargetSummary) => {
        const newVal: CommonTargetInfo = {
            name: targetSummary.name,
            id: targetSummary.id,
            type: TargetType.Web,
            status: targetSummary.status,
            environmentId: targetSummary.environmentId,
            region: targetSummary.region,
            agentVersion: targetSummary.agentVersion
        };
        zippedTargetsWeb.push(newVal);
    });

    const zippedTargetsKube: CommonTargetInfo[] = [];
    const awaitedKubeTarget = await clusterTargets;
    awaitedKubeTarget.forEach((targetSummary: KubeClusterSummary) => {
        const newVal: CommonTargetInfo = {
            name: targetSummary.name,
            id: targetSummary.id,
            type: TargetType.Cluster,
            status: targetSummary.status,
            environmentId: targetSummary.environmentId,
            region: targetSummary.region,
            agentVersion: targetSummary.agentVersion
        };
        zippedTargetsKube.push(newVal);
    });

    // Now concat all the types of targets
    let zippedTargets = concat (zippedTargetsShell, zippedTargetsDb, zippedTargetsWeb, zippedTargetsKube);

    if(!! targetTypeString) {
        const targetType = parseTargetType(targetTypeString);
        zippedTargets = filter(zippedTargets,t => t.type == targetType);
    }

    let matchedTargets: CommonTargetInfo[];

    if(!! parsedTarget.id) {
        matchedTargets = filter(zippedTargets,t => t.id == parsedTarget.id);
    } else if(!! parsedTarget.name) {
        matchedTargets = filter(zippedTargets,t => t.name == parsedTarget.name);
    }

    if(matchedTargets.length == 0) {
        return undefined;
    } else if(matchedTargets.length == 1) {
        parsedTarget.id = matchedTargets[0].id;
        parsedTarget.name = matchedTargets[0].name;
        parsedTarget.type = matchedTargets[0].type;
        parsedTarget.envId = matchedTargets[0].environmentId;
        parsedTarget.envName = filter(await envs, e => e.id == parsedTarget.envId)[0].name;
    } else {
        logger.warn('More than one target found with the same targetName');

        // Print the targets we have found so the user can easily type the next command
        logger.info(`Matched ${matchedTargets.length} targets:`);
        matchedTargets.forEach((matchedTarget: CommonTargetInfo) => {
            logger.warn(`    * ${matchedTarget.name} (${matchedTarget.id}): ${matchedTarget.type}`);
        });
        logger.info(`Please connect using targetId instead of the targetName (zli connect test@1234)`);
        await cleanExit(1, logger);
    }

    return parsedTarget;
}

export function readFile(filePath: string): Promise<string> {
    return util.promisify(fs.readFile)(filePath, 'utf8');
}

export async function getEnvironmentFromName(enviromentName: string, envs: EnvironmentSummary[], logger: Logger): Promise<EnvironmentSummary> {
    const environment = envs.find(envDetails => envDetails.name == enviromentName);
    if (!environment) {
        logger.error(`Environment ${enviromentName} does not exist`);
        await cleanExit(1, logger);
    }
    return environment;
}

export function randomAlphaNumericString(length: number) : string {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}


export function ssmTargetToTargetSummary(ssm: SsmTargetSummary): TargetSummary {
    return {type: TargetType.SsmTarget, id: ssm.id, name: ssm.name, environmentId: ssm.environmentId, agentVersion: ssm.agentVersion, status: ssm.status, targetUsers: undefined, region: ssm.region};
}

export function dynamicConfigToTargetSummary(config: DynamicAccessConfigSummary): TargetSummary {
    return {type: TargetType.DynamicAccessConfig, id: config.id, name: config.name, environmentId: config.environmentId, agentVersion: 'N/A', status: undefined, targetUsers: undefined, region: 'N/A'};
}