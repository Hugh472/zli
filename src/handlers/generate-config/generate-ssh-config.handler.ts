import fs from 'fs';
import os from 'os';
import path from 'path';
import prompts from 'prompts';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { TunnelsResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { buildSshConfigString } from '../ssh-proxy-config.handler';

/**
 *  Generates an ssh config file based on tunnel targets the user has access to, then Includes it 
 * in the user's existing ssh config file
 * @param configService {ConfigService}
 * @param logger {Logger}
 * @param processName {string} the calling process (e.g., "zli"), used to populate the ProxyCommand
 */
export async function generateSshConfigHandler(configService: ConfigService, logger: Logger, processName: string) {
    // Query for tunnel targets that the user has access to
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const tunnels: TunnelsResponse[] = await policyQueryHttpService.GetTunnels();

    // Build our ssh config file
    const { allHosts, prefix } = buildSshConfigString(configService, processName);
    const bzConfigContentsFormatted = formatBzConfigContents(tunnels, allHosts, prefix);

    // Determine + write to the user's ssh and bzero-ssh config path
    const { userConfigPath, bzConfigPath } = await getFilePaths();
    console.log({ userConfigPath, bzConfigPath });
    fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);

    // Link the ssh config path, with our new bzero-ssh config path
    linkNewConfigFile(userConfigPath, bzConfigPath, logger);

    logger.info('SSH configuration generated successfully!');
}

/**
 * get filepaths from the user via CLI prompt
 * @returns {{userConfigPath: string, bzConfigPath: string}}
 */
async function getFilePaths() {
    const userConfigPath = path.join(
        os.homedir(), '.ssh', 'config'
    );

    const bzConfigPath = path.join(
        os.homedir(), '.ssh', 'bz-config'
    );

    const filepaths = await prompts([
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

    return filepaths;
}

/**
 * 
 * @param tunnels {TunnelsResponse[]} A list of targets the user can access over SSH tunnel
 * @param allHosts {string} the wildcard configuration that applies to all bzero hosts
 * @param prefix {string} e.g., "bzero-", prepended to hostnames in the config file
 * @returns {string} the bz config file contents
 */
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

/**
 * Attaches an 'Include path/to/bz-config' line to the user's ssh config file, if not there already
 * @param userConfigFile {string} path of the user's config file
 * @param bzConfigFile {string} path of the BZ config file
 * @param logger {Logger}
 */
function linkNewConfigFile(userConfigFile: string, bzConfigFile: string, logger: Logger) {
    const includeStmt = `Include ${bzConfigFile}`;
    let configContents;
    let userConfigExists = true;

    try {
        configContents = fs.readFileSync(userConfigFile);
    } catch (err) {
        if (err.code === 'ENOENT') {
            userConfigExists = false;
            configContents = Buffer.from('');
        } else {
            logger.error("Unable to read your ssh config file")
            throw err;
        }
    }

    // if the config file doesn't exist or the include statement
    // isn't present, prepend it to the file
    if (!userConfigExists || !configContents.includes(includeStmt)) {
        const fd = fs.openSync(userConfigFile, 'w+');
        const buffer = Buffer.from(`${includeStmt}\n\n`);
        fs.writeSync(fd, buffer, 0, buffer.length, 0);
        fs.writeSync(fd, configContents, 0, configContents.length, buffer.length);
        fs.close(fd, () => { });
    }
}


