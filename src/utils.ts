import { ParsedTargetString, TargetSummary, TargetType } from './types';
import { max } from 'lodash';
import { EnvironmentDetails } from './http.service/http.service.types';
import Table from 'cli-table3';
import { Logger } from './logger.service/logger';
import { cleanExit } from './handlers/clean-exit.handler';
import _ from 'lodash';

// case insensitive substring search, 'find targetString in searchString'
export function findSubstring(targetString: string, searchString: string) : boolean
{
    return searchString.toLowerCase().indexOf(targetString.toLowerCase()) !== -1;
}

export const targetStringExample: string = '[targetUser@]<targetId-or-targetName>:<targetPath>';
export const targetStringExampleNoPath : string = '[targetUser@]<targetId-or-targetName>';

export function parseTargetType(targetType: string) : TargetType
{
    const targetTypePattern = /^(ssm|ssh|dynamic)$/i; // case insensitive check for targetType

    if(! targetTypePattern.test(targetType))
        return undefined;

    return <TargetType> targetType.toUpperCase();
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
    const guidPattern = /^[0-9A-Fa-f]{8}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{4}[-][0-9A-Fa-f]{12}$/;
    if(guidPattern.test(targetSomething))
        result.id = targetSomething;
    else
        result.name = targetSomething;

    if(colonSplit[1] !== '')
        result.path = colonSplit[1];

    return result;
}

export function getTableOfTargets(targets: TargetSummary[], envs: EnvironmentDetails[], showDetail: boolean = false, showGuid: boolean = false) : string
{
    const targetNameLength = max(targets.map(t => t.name.length).concat(16)); // if max is 0 then use 16 as width
    const envNameLength = max(envs.map(e => e.name.length).concat(16));       // same same

    const header: string[] = ['Type', 'Name', 'Environment'];
    const columnWidths = [10, targetNameLength + 2, envNameLength + 2];

    if(showGuid)
    {
        header.push('Id');
        columnWidths.push(38);
    }

    if(showDetail)
    {
        header.push('Agent Version', 'Status');
        columnWidths.push(15, 10);
    }

    // ref: https://github.com/cli-table/cli-table3
    const table = new Table({ head: header, colWidths: columnWidths });

    targets.forEach(target => {
        const row = [target.type, target.name, envs.filter(e => e.id == target.environmentId).pop().name];

        if(showGuid) {
            row.push(target.id);
        }

        if(showDetail) {
            row.push(target.agentVersion);
            row.push(target.status);
        }

        table.push(row);
    }
    );

    return table.toString();
}

// Figure out target id based on target name and target type.
// Also preforms error checking on target type and target string passed in
export async function disambiguateTarget(
    targetTypeString: string,
    targetString: string,
    logger: Logger,
    dynamicConfigs: Promise<TargetSummary[]>,
    ssmTargets: Promise<TargetSummary[]>,
    sshTargets: Promise<TargetSummary[]>,
    envs: Promise<EnvironmentDetails[]>): Promise<ParsedTargetString> {

    const parsedTarget = parseTargetString(targetString);

    if(! parsedTarget) {
        return undefined;
    }

    let zippedTargets = _.concat(await ssmTargets, await sshTargets, await dynamicConfigs);

    if(!! targetTypeString) {
        const targetType = parseTargetType(targetTypeString);
        zippedTargets = zippedTargets.filter(t => t.type == targetType);
    }

    let matchedTargets: TargetSummary[];

    if(!! parsedTarget.id) {
        matchedTargets = zippedTargets.filter(t => t.id == parsedTarget.id);
    } else if(!! parsedTarget.name) {
        matchedTargets = zippedTargets.filter(t => t.name == parsedTarget.name);
    }

    if(matchedTargets.length == 0) {
        return undefined;
    } else if(matchedTargets.length == 1) {
        parsedTarget.id = matchedTargets[0].id;
        parsedTarget.name = matchedTargets[0].name;
        parsedTarget.type = matchedTargets[0].type;
        parsedTarget.envId = matchedTargets[0].environmentId;
        parsedTarget.envName = (await envs).filter(e => e.id == parsedTarget.envId)[0].name;
    } else {
        logger.warn('More than one target found with the same targetName');
        logger.info(`Please specify the targetId instead of the targetName (zli lt -n ${parsedTarget.name} -d)`);
        await cleanExit(1, logger);
    }

    return parsedTarget;
}