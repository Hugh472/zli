import fs from 'fs';
import os from 'os';
import path from 'path';
import prompts from 'prompts';
import yargs from 'yargs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { TunnelsResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { buildSshConfigString } from '../ssh-proxy-config.handler';
import { generateConfigArgs } from './generate-config.command-builder';


/**
 *  Generates an ssh config file based on tunnel targets the user has access to, then Includes it 
 * in the user's existing ssh config file
 * @param configService {ConfigService}
 * @param logger {Logger}
 * @param processName {string} the calling process (e.g., "zli"), used to populate the ProxyCommand
 */
export async function generateSshConfigHandler(argv: yargs.Arguments<generateConfigArgs>, configService: ConfigService, logger: Logger, processName: string) {
    // Query for tunnel targets that the user has access to
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const tunnels: TunnelsResponse[] = await policyQueryHttpService.GetTunnels();

    // Build our ssh config file
    const { allHosts, prefix } = buildSshConfigString(configService, processName);
    const bzConfigContentsFormatted = formatBzConfigContents(tunnels, allHosts, prefix);

    // Determine + write to the user's ssh and bzero-ssh config path
    const { userConfigPath, bzConfigPath } = await getFilePaths(argv.mySshPath, argv.bzSshPath, logger);
    fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);

    // Link the ssh config path, with our new bzero-ssh config path
    linkNewConfigFile(userConfigPath, bzConfigPath, logger);

    logger.info('SSH configuration generated successfully!');
}

/**
 * get filepaths from the user via CLI prompt
 * @returns {{userConfigPath: string, bzConfigPath: string}}
 */
async function getFilePaths(userSshPath: string | null, bzSshPath: string | null, logger: Logger) {

    let userConfigPath: string;
    let bzConfigPath: string;

    if (userSshPath) {
        userConfigPath = userSshPath;
    } else {
        userConfigPath = path.join(os.homedir(), '.ssh', 'config');
        logger.info(`Using default location '${userConfigPath}' for your primary SSH config file; to change this, use the --mySshPath option`);
    }
    if (bzSshPath) {
        bzConfigPath = bzSshPath;
    } else {
        bzConfigPath = path.join(os.homedir(), '.ssh', 'bz-config');
        logger.info(`Using default location '${bzConfigPath}' for the BastionZero SSH config file; to change this, use the --bzSshPath option`);
    }

    return {
        userConfigPath,
        bzConfigPath
    }
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


