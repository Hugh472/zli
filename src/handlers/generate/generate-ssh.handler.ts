import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { PolicyQueryHttpService } from '../../http-services/policy-query/policy-query.http-services';
import { TunnelsResponse } from '../../../webshell-common-ts/http/v2/policy-query/responses/tunnels.response';
import { buildSshConfigStrings } from './generate-ssh-proxy.handler';
import { generateConfigArgs } from './generate-config.command-builder';

/**
 *  Generates an ssh config file based on tunnel targets the user has access to, then Includes it
 * in the user's existing ssh config file
 * @param configService {ConfigService}
 * @param logger {Logger}
 * @param processName {string} the calling process (e.g., "zli"), used to populate the ProxyCommand
 */
export async function generateSshHandler(argv: yargs.Arguments<generateConfigArgs>, configService: ConfigService, logger: Logger, processName: string) {
    const policyQueryHttpService = new PolicyQueryHttpService(configService, logger);
    const tunnels: TunnelsResponse[] = await policyQueryHttpService.GetTunnels();

    // Build our ssh config file
    const { identityFile, proxyCommand, prefix } = await buildSshConfigStrings(configService, processName, logger);
    const bzConfigContentsFormatted = formatBzConfigContents(tunnels, identityFile, proxyCommand);

    // Determine and write to the user's ssh and bzero-ssh config path
    const { userConfigPath, bzConfigPath } = getFilePaths(argv.mySshPath, argv.bzSshPath, prefix);
    fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);

    // Link the ssh config path, with our new bzero-ssh config path
    linkNewConfigFile(userConfigPath, bzConfigPath, logger);

    logger.info(`SSH configuration generated successfully! See ${bzConfigPath} for list of reachable targets`);
}

/**
 * use default filepaths unless user provided some at the CLI
 * @param mySshPath {string} path to the user's ssh config file
 * @param bzSshPath {string} path to the bz config file
 * @param configPrefix {string} assigns a prefix to the bz config filename based on runtime environment (e.g. dev, stage)
 * @returns {{userConfigPath: string, bzConfigPath: string}}
 */
function getFilePaths(userSshPath: string, bzSshPath: string, configPrefix: string) {
    const userConfigPath = userSshPath ? userSshPath : path.join(process.env.HOME, '.ssh', 'config');
    const bzConfigPath = bzSshPath ? bzSshPath : path.join(process.env.HOME, '.ssh', `${configPrefix}bz-config`);

    return { userConfigPath, bzConfigPath };
}

/**
 * given some config information, produces a valid SSH config string
 * @param tunnels {TunnelsResponse[]} A list of targets the user can access over SSH tunnel
 * @param identityFile {string} A path to the user's key file
 * @param proxyCommand {string} A proxy command routing SSH requests to the ZLI
 * @returns {string} the bz config file contents
 */
function formatBzConfigContents(tunnels: TunnelsResponse[], identityFile: string, proxyCommand: string): string {
    let contents = ``;

    // add per-target configs
    for (const tunnel of tunnels) {
        // only add username if there is exactly one -- otherwise, user must specify user@host
        const user = tunnel.targetUsers.length === 1 ? `User ${tunnel.targetUsers[0].userName}` : ``;
        contents += `
Host ${tunnel.targetName}
    ${identityFile}
    ${proxyCommand}
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
            logger.error('Unable to read your ssh config file');
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

