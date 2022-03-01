import fs from 'fs';
import os from 'os';
import path from 'path';
import prompts from 'prompts';
// FIXME: absolute path?
import { Logger } from '../../services/logger/logger.service';

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
        {
            type: 'text',
            name: 'userIdentityPath',
            message: 'Which identity (key) file should be referenced in your SSH config file? (enter a path)',
            validate: userIdentityPath => userIdentityPath.length === 0 ? 'Must enter a filename' : true
        }
    ]);

    return response
}

async function getBzConfigContents() {
    // TODO: make an API call
    return `Host iamlazy
    HostName bzero-milano-postgres 
    IdentityFile $IDENTITY_FILE
    ProxyCommand zli ssh-proxy  -s %h %r %p /Users/sidpremkumar/Library/Preferences/bastionzero-zli-nodejs/bzero-temp-key
    user postgres
    LocalForward 6100 localhost:5432
    LocalForward 8083 localhost:5001
`
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

export async function sshConfigSyncHandler(logger: Logger) {
    const { userConfigPath, bzConfigPath, userIdentityPath } = await getFilePaths();

    const bzConfigContents = await getBzConfigContents();
    const bzConfigContentsFormatted = formatBzConfigContents(bzConfigContents, userIdentityPath);

    fs.writeFileSync(bzConfigPath, bzConfigContentsFormatted);
    linkNewConfigFile(userConfigPath, bzConfigPath);

    logger.info("SSH configuration synced successfully!")
}