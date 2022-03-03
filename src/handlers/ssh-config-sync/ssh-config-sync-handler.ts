import fs from 'fs';
import os from 'os';
import path from 'path';
import prompts from 'prompts';
// FIXME: absolute paths?
import util from 'util'
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { PolicyHttpService } from '../../http-services/policy/policy.http-services'

export async function sshConfigSyncHandler(configService: ConfigService, logger: Logger) {
    const { userConfigPath, bzConfigPath } = await getFilePaths();

    const policyHttpService = new PolicyHttpService(configService, logger);
    const policies = await policyHttpService.ListTargetConnectPolicies()
    console.log(util.inspect(policies, false, null, true))
    // TODO: needs to come from what we generate
    // TODO: obviously we'll format policies
    const bzConfigContentsFormatted = formatBzConfigContents(JSON.stringify(policies), "TODO:");

    fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);
    linkNewConfigFile(userConfigPath, bzConfigPath);
    logger.info("SSH configuration synced successfully!")
}

async function getFilePaths() {

    const homeDir = os.homedir();

    const userConfigPath = path.join(
        `${homeDir}`, '.ssh', 'config'
    );

    const bzConfigPath = path.join(
        `${homeDir}`, '.ssh', 'bz-config'
    );

    const response = await prompts([
        {
            type: 'text',
            name: 'userConfigPath',
            message: `What is your primary SSH config file? `,
            initial: userConfigPath
        },
        {
            type: 'text',
            name: 'bzConfigPath',
            message: `Where should the BZ config file be stored?`,
            initial: bzConfigPath
        },
    ]);

    return response
}

function formatBzConfigContents(bzConfigContents: string, userIdentityFile: string) {
    return bzConfigContents.replace('$IDENTITY_FILE', userIdentityFile);
}

function linkNewConfigFile(useConfigFile: string, bzConfigFile: string) {
    const includeStmt = `Include ${bzConfigFile}`;
    const configContents = fs.readFileSync(useConfigFile);

    // if the include statement isn't present, prepend it to the file
    if (!configContents.includes(includeStmt)) {
        const fd = fs.openSync(useConfigFile, 'w+');
        const buffer = Buffer.from(`${includeStmt}\n\n`);
        fs.writeSync(fd, buffer, 0, buffer.length, 0);
        fs.writeSync(fd, configContents, 0, configContents.length, buffer.length);
        fs.close(fd, (err) => {
            // TODO: what's a good callback...
            if (err) {
                console.error('Failed to close file', err);
            }
        });
    }
}


