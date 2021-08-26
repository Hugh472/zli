import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { QuickstartSsmService } from '../../services/quickstart/quickstart-ssm.service';
import { SSHHost } from '../../services/quickstart/quickstart-ssm.service.types';
import { MixpanelService } from '../../services/mixpanel/mixpanel.service';
import { ParsedTargetString, TargetType } from '../../services/common.types';
import { EnvironmentService } from '../../services/environment/environment.service';
import { connectHandler } from '../connect/connect.handler';

import { KeyEncryptedError, parsePrivateKey } from 'sshpk';
import SSHConfig from 'ssh2-promise/lib/sshConfig';
import prompts from 'prompts';
import util from 'util';
import fs from 'fs';
import _ from 'lodash';

export async function quickstartHandler(
    argv: any,
    logger: Logger,
    configService: ConfigService,
    mixpanelService: MixpanelService,
) {
    const quickstartService = new QuickstartSsmService(logger, configService);
    const sshConfigFilePath: string = argv.sshConfigFile;
    const showParseErrors: boolean = argv.showParseErrors;

    // Parse SSH config file
    logger.info(`\nParsing SSH config file: ${sshConfigFilePath}`);
    const sshConfigFileAsStr = await readFile(sshConfigFilePath);
    const [parsed, parseErrors] = quickstartService.parseSSHHosts(sshConfigFileAsStr);

    // Print parse errors
    if (showParseErrors && parseErrors.size > 0) {
        logger.warn(`Warning: Failed parsing some hosts from SSH config file. ${parseErrors.size} invalid host(s):`);
        for (let [name, errors] of parseErrors) {
            logger.warn(`Host: ${name}`);
            errors.forEach(value => logger.warn(`\t${value}`));
        }
    }
    if (!showParseErrors && parseErrors.size > 0) {
        logger.warn(`Warning: Failed parsing some hosts from SSH config file. ${parseErrors.size} invalid host(s). Pass --showParseErrors flag for more information.`);
    }

    // Fail early if there are no valid hosts to choose from
    if (parsed.size == 0) {
        logger.error('Found zero valid SSH hosts');
        await cleanExit(1, logger);
    }

    // Callback on cancel prompt
    const onCancelPrompt = async () => {
        logger.info('Prompt cancelled. Exiting out of quickstart...');
        await cleanExit(1, logger);
    }

    logger.info('\nPress CTRL-C to exit at any time.');

    // Prompt user with selection of hosts
    logger.info(`\nFound ${parsed.size} valid SSH hosts`);
    const hostsResponse = await prompts({
        type: 'multiselect',
        name: 'value',
        message: 'Which SSH hosts do you want to connect with BastionZero?',
        choices: Array.from(parsed.keys()).map(hostName => ({ title: hostName, value: hostName } as prompts.Choice)),
        instructions: 'Use space to select and up/down to navigate. Return to submit.'
    }, { onCancel: onCancelPrompt });
    const selectedHostsNames: string[] = hostsResponse.value;

    if (selectedHostsNames.length == 0) {
        logger.info('No hosts selected.');
        await cleanExit(1, logger);
    }

    // Ask user if they want to connect to one of their target(s) after it is
    // registered
    const connectAfterResponse = await prompts({
        type: 'toggle',
        name: 'value',
        message: 'Do you want to immediately connect to your target once it is registered with BastionZero?',
        initial: true,
        active: 'yes',
        inactive: 'no',
        instructions: 'Use tab or arrow keys to switch between options. Return to submit.',
    }, { onCancel: onCancelPrompt });
    const shouldConnectAfter: boolean = connectAfterResponse.value;
    let targetToConnectToAtEnd: SSHHost = undefined;

    // If the user selected more than one host, then ask which host they want to connect to
    if (shouldConnectAfter && selectedHostsNames.length > 1) {
        const choices = selectedHostsNames.map(hostName => ({ title: hostName, value: hostName } as prompts.Choice));
        const targetToConnectAfterResponse = await prompts({
            type: 'select',
            name: 'value',
            message: 'Which target?',
            choices: choices,
            initial: 1,
            instructions: 'Use up/down to navigate. Use tab to cycle the list. Return to submit.'
        }, { onCancel: onCancelPrompt });
        targetToConnectToAtEnd = parsed.get(targetToConnectAfterResponse.value);
    }

    // Otherwise, we know which host it is
    if (shouldConnectAfter && selectedHostsNames.length == 1) {
        targetToConnectToAtEnd = parsed.get(selectedHostsNames[0]);
    }

    // Run autodiscovery script sequentially.
    //
    // TODO: Run this forloop concurrently (I/O bound work) for each SSH host.
    // Collect results as they come in.
    let targetToConnectToAtEndAsParsedTargetString: ParsedTargetString = undefined;
    let didRegisterAtLeastOne : boolean;
    for (const selectedHostName of selectedHostsNames) {
        const selectedHost = parsed.get(selectedHostName);
        try {
            logger.info(`Attempting to add SSH host ${selectedHost.name} to BastionZero...`);

            // Special logic to handle encrypted SSH key file
            var passphraseKeyFile : undefined;
            var keyFile = await readFile(selectedHost.identityFile);
            try {
                parsePrivateKey(keyFile, 'auto');
            } catch (e) {
                if (e instanceof KeyEncryptedError) {
                    logger.info(`${selectedHost.name}'s IdentityFile (${selectedHost.identityFile}) is encrypted!`);

                    // Custom onCancelPrompt which continues with the next host in selectedHostNames rather than exiting the process.
                    let canceled: boolean;
                    const onCancelPrompt = async () => {
                        canceled = true;
                    }
                    const identityKeyFilePasswordResponse = await prompts({
                        type: 'password',
                        name: 'value',
                        message: `Enter the passphrase for encrypted SSH key ${selectedHost.identityFile}:`
                    }, { onCancel: onCancelPrompt });
                    passphraseKeyFile = identityKeyFilePasswordResponse.value;

                    if (canceled) {
                        logger.info(`Skipping ${selectedHost.name} because password for IdentityFile was not provided.`);
                        continue;
                    }
                } else {
                    logger.error(`Failed parsing ${selectedHost.name}'s IdentityFile ${selectedHost.identityFile}: ${e}`);
                    continue;
                }
            }

            // Build SSH configuration and run the script on the host
            var sshConfig: SSHConfig = {
                host: selectedHost.hostIp,
                username: selectedHost.username,
                identity: selectedHost.identityFile,
                port: selectedHost.port,
                passphrase: passphraseKeyFile
            }
            logger.info(`Running autodiscovery script on SSH host ${selectedHost.name} (could take several minutes)...`);
            const ssmTargetId = await quickstartService.runAutodiscoveryOnSSHHost(sshConfig, selectedHost.name);
            logger.info(`Bastion assigned SSH host ${selectedHost.name} with the following unique target id: ${ssmTargetId}`);

            // Poll for "Online" status
            logger.info(`Waiting for target ${selectedHost.name} to become online (could take several minutes)...`);
            const ssmTarget = await quickstartService.pollSsmTargetOnline(ssmTargetId);
            logger.info(`SSH host ${selectedHost.name} successfully added to BastionZero!`);
            didRegisterAtLeastOne = true;

            // Gather some extra information from Bastion if this is the target
            // user specified to connect to at the end.
            if (shouldConnectAfter && selectedHostName === targetToConnectToAtEnd.name) {
                const envService = new EnvironmentService(configService, logger);
                const envs = await envService.ListEnvironments();
                const environment = envs.find(envDetails => envDetails.id == ssmTarget.environmentId);
                targetToConnectToAtEndAsParsedTargetString = {
                    id: ssmTarget.id,
                    user: "ssm-user",
                    type: TargetType.SSM,
                    envName: environment.name
                } as ParsedTargetString;
            }
        } catch (error) {
            logger.error(`Failed to add SSH host: ${selectedHost.name} to BastionZero. ${error}`);
        }
    }

    let exitCode = didRegisterAtLeastOne ? 0 : 1;
    if (targetToConnectToAtEndAsParsedTargetString) {
        logger.info(`Connecting to ${targetToConnectToAtEnd.name}...`);
        exitCode = await connectHandler(configService, logger, mixpanelService, targetToConnectToAtEndAsParsedTargetString);
    }

    if (didRegisterAtLeastOne)
        logger.info('Use `zli connect` to connect to your registered targets.')

    await cleanExit(exitCode, logger);
}

function readFile(filePath: string): Promise<string> {
    return util.promisify(fs.readFile)(filePath, 'utf8');
}