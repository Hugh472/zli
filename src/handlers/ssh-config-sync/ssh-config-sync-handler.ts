import fs from 'fs';
import os from 'os';
import path from 'path';
import prompts from 'prompts';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { TunnelsResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { buildSshConfigString } from '../../handlers/ssh-proxy-config.handler';

export async function sshConfigSyncHandler(configService: ConfigService, logger: Logger, processName: string) {
    const { userConfigPath, bzConfigPath } = await getFilePaths();

    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const tunnels: TunnelsResponse[] = await policyQueryHttpService.GetTunnels();
    const { allHosts, prefix } = buildSshConfigString(configService, processName);
    const bzConfigContentsFormatted = formatBzConfigContents(tunnels, allHosts, prefix);

    fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);
    linkNewConfigFile(userConfigPath, bzConfigPath);
    logger.info('SSH configuration synced successfully!');
}

async function getFilePaths() {
    const userConfigPath = path.join(
        os.homedir(), '.ssh', 'config'
    );

    const bzConfigPath = path.join(
        os.homedir(), '.ssh', 'bz-config'
    );

    const response = await prompts([
        {
            type: 'text',
            name: 'userConfigPath',
            message: `Where is your primary SSH config file? `,
            initial: userConfigPath
        },
        {
            type: 'text',
            name: 'bzConfigPath',
            message: `Where should the BZ config file be stored?`,
            initial: bzConfigPath
        },
    ]);

    return response;
}

function formatBzConfigContents(tunnels: TunnelsResponse[], allHosts: string, prefix: string) {
    // initialize with wildcard config
    let contents = allHosts;

    // add per-target configs
    for (const tunnel of tunnels) {
        // only add username if there is exactly one -- otherwise, user must specify user@host
        const user = tunnel.targetUsers.length === 1 ? `User ${tunnel.targetUsers[0].userName}` : ``;
        contents += `
Host ${prefix}${tunnel.targetName}
    ${user}
`;
    }

    return contents;
}

function linkNewConfigFile(userConfigFile: string, bzConfigFile: string) {
    const includeStmt = `Include ${bzConfigFile}`;
    let configContents;
    let userConfigExists = true;

    try {
        configContents = fs.readFileSync(userConfigFile);
    } catch (err) {
        if (err.code === 'ENOENT') {
            userConfigExists = false;
            configContents = Buffer.from("");
        } else {
            throw err;
        }
    }

    //      if the config file doesn't exist or the include statement 
    // isn't present, prepend it to the file
    if (!userConfigExists || !configContents.includes(includeStmt)) {
        const fd = fs.openSync(userConfigFile, 'w+');
        const buffer = Buffer.from(`${includeStmt}\n\n`);
        fs.writeSync(fd, buffer, 0, buffer.length, 0);
        fs.writeSync(fd, configContents, 0, configContents.length, buffer.length);
        fs.close(fd, () => { });
    }
}


