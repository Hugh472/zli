import { ConfigService } from '../services/config/config.service';
import { Logger } from '../services/logger/logger.service';


export function sshProxyConfigHandler(configService: ConfigService, logger: Logger, processName: string) {

    const { identityFile, proxyCommand, prefix } = buildSshConfigStrings(configService, processName);

    logger.info(`
Add the following lines to your ssh config (~/.ssh/config) file:

Host ${prefix}*
  ${identityFile}
  ${proxyCommand}

Then you can use native ssh to connect to any of your ssm targets using the following syntax:

ssh <user>@${prefix}<ssm-target-id-or-name>
`);
}

export function buildSshConfigStrings(configService: ConfigService, processName: string) {
    const keyPath = configService.sshKeyPath();
    const configName = configService.getConfigName();
    let prefix = 'bzero-';
    let configNameArg = '';
    if (configName != 'prod') {
        prefix = `${configName}-${prefix}`;
        configNameArg = `--configName=${configName}`;
    }

    const identityFile = `IdentityFile ${keyPath}`
    const proxyCommand = `ProxyCommand ${processName} ssh-proxy ${configNameArg} -s ${prefix}%n %r %p ${keyPath}`

    return { identityFile, proxyCommand, prefix };

}