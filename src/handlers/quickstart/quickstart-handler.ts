import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { QuickstartSsmService } from '../../services/quickstart/quickstart-ssm.service';
import { InvalidSSHHost, ValidSSHHost } from '../../services/quickstart/quickstart-ssm.service.types';
import { MixpanelService } from '../../services/mixpanel/mixpanel.service';
import { ParsedTargetString, TargetType } from '../../services/common.types';
import { EnvironmentService } from '../../services/environment/environment.service';
import { connectHandler } from '../connect/connect.handler';
import { readFile } from '../../utils';

import prompts, { PromptObject } from 'prompts';

async function interactiveDebugSession(
    invalidSSHHosts: InvalidSSHHost[],
    quickstartService: QuickstartSsmService,
    logger: Logger,
    onCancel: (prompt: PromptObject, answers: any) => void): Promise<ValidSSHHost[]> {

    // Get pretty string of invalid SSH hosts' names
    const prettyInvalidSSHHosts: string = invalidSSHHosts.map(host => host.name).join(", ");
    logger.warn(`Hosts missing required parameters: ${prettyInvalidSSHHosts}`);

    let fixedSSHHosts: ValidSSHHost[] = [];
    const confirmDebugSessionResponse = await prompts({
        type: 'toggle',
        name: 'value',
        message: 'Do you want the zli to help you fix the issues?',
        initial: true,
        active: 'yes',
        inactive: 'no',
    }, { onCancel: onCancel });
    const shouldStartDebugSession: boolean = confirmDebugSessionResponse.value;

    if (!shouldStartDebugSession)
        return fixedSSHHosts;

    logger.info('\nPress CTRL-C to skip the prompted host or to exit out of quickstart\n');

    for (const invalidSSHHost of invalidSSHHosts) {
        const fixedHost = await quickstartService.promptFixParseErrorsForHost(invalidSSHHost.name, invalidSSHHost.parseErrors);
        if (fixedHost === undefined) {
            const shouldSkip = await quickstartService.promptSkipHostOrExit(invalidSSHHost.name, onCancel);

            if (shouldSkip) {
                logger.info(`Skipping host ${invalidSSHHost.name}...`);
                continue;
            } else {
                logger.info('Prompt cancelled. Exiting out of quickstart...');
                await cleanExit(1, logger);
            }
        } else {
            fixedSSHHosts.push(fixedHost);
        }
    }

    return fixedSSHHosts;
}

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
    const [validSSHHosts, invalidSSHHosts] = quickstartService.parseSSHHosts(sshConfigFileAsStr);

    // Callback on cancel prompt
    const onCancelPrompt = async () => {
        logger.info('Prompt cancelled. Exiting out of quickstart...');
        await cleanExit(1, logger);
    }

    logger.info(`\nFound ${validSSHHosts.size} valid SSH hosts!`);

    logger.warn(`${invalidSSHHosts.length} host(s) in the SSH config file are missing required parameters used to connect them with BastionZero.`)

    // Handle parse errors
    if (showParseErrors && invalidSSHHosts.length > 0) {
        const fixedSSHHosts = await interactiveDebugSession(invalidSSHHosts, quickstartService, logger, onCancelPrompt);
        // Add them to the valid mapping
        fixedSSHHosts.forEach(validHost => validSSHHosts.set(validHost.name, validHost));
        if (fixedSSHHosts.length > 0) {
            logger.info(`Added ${fixedSSHHosts.length} more valid host(s) for a total of ${validSSHHosts.size} valid SSH hosts!`);
        }
    }
    else if (!showParseErrors && invalidSSHHosts.length > 0) {
        logger.warn('Skipping interactive debug session because --skipDebug flag was passed.')
    }

    // Fail early if there are no valid hosts to choose from
    if (validSSHHosts.size == 0) {
        logger.error('Exiting because there are no valid hosts to connect to');
        await cleanExit(1, logger);
    }

    logger.info('\nPress CTRL-C to exit at any time.');

    // Prompt user with selection of hosts
    const hostsResponse = await prompts({
        type: 'multiselect',
        name: 'value',
        message: 'Which SSH hosts do you want to connect with BastionZero?',
        choices: Array.from(validSSHHosts.keys()).map(hostName => ({ title: hostName, value: hostName } as prompts.Choice)),
        instructions: 'Use space to select and up/down to navigate. Return to submit.'
    }, { onCancel: onCancelPrompt });
    const selectedHostsNames: string[] = hostsResponse.value;

    if (selectedHostsNames.length == 0) {
        logger.info('No hosts selected. Exiting out of quickstart...');
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
    }, { onCancel: onCancelPrompt });
    const shouldConnectAfter: boolean = connectAfterResponse.value;
    let targetToConnectToAtEnd: ValidSSHHost = undefined;
    if (shouldConnectAfter && selectedHostsNames.length > 1) {
        // If the user selected more than one host, then ask which host they
        // want to connect to
        const choices = selectedHostsNames.map(hostName => ({ title: hostName, value: hostName } as prompts.Choice));
        const targetToConnectAfterResponse = await prompts({
            type: 'select',
            name: 'value',
            message: 'Which target?',
            choices: choices,
            initial: 1,
            instructions: 'Use up/down to navigate. Use tab to cycle the list. Return to submit.'
        }, { onCancel: onCancelPrompt });
        targetToConnectToAtEnd = validSSHHosts.get(targetToConnectAfterResponse.value);
    }
    else if (shouldConnectAfter && selectedHostsNames.length == 1) {
        // Otherwise, we know which host it is
        targetToConnectToAtEnd = validSSHHosts.get(selectedHostsNames[0]);
    }

    // Convert list of selected ValidSSHHosts to SSHConfigs to use with the
    // ssh2-promise library. This conversion is interactive. It will prompt the
    // user to provide a passphrase if any of the selected hosts' IdentityFiles
    // are encrypted.
    let validSSHConfigs = await quickstartService.promptConvertValidSSHHostsToSSHConfigs(
        selectedHostsNames.map(hostName => validSSHHosts.get(hostName)),
        onCancelPrompt);

    // Fail early if the validation check above removed all valid hosts
    if (validSSHConfigs.length == 0) {
        logger.info('All selected hosts were removed from list of SSH hosts to add to BastionZero. Exiting out of quickstart...');
        await cleanExit(1, logger);
    }

    // Ask the user if they're ready to begin
    const prettyHostsToAttemptAutodisocvery: string = validSSHConfigs.map(config => config.sshHostName).join(", ");
    const readyResponse = await prompts({
        type: 'toggle',
        name: 'value',
        message: `Please confirm that you want to add ${prettyHostsToAttemptAutodisocvery} to BastionZero:`,
        initial: true,
        active: 'yes',
        inactive: 'no',
    }, { onCancel: onCancelPrompt });
    const isReady: boolean = readyResponse.value;

    if (! isReady) {
        logger.info('Exiting out of quickstart...');
        await cleanExit(1, logger);
    }

    // Run autodiscovery script sequentially.
    //
    // TODO: Run this forloop concurrently (I/O bound work) for each SSH host.
    // Collect results as they come in.
    let targetToConnectToAtEndAsParsedTargetString: ParsedTargetString = undefined;
    let didRegisterAtLeastOne: boolean;
    for (const validSSHConfig of validSSHConfigs) {
        try {
            logger.info(`Attempting to add SSH host ${validSSHConfig.sshHostName} to BastionZero...`);

            const sshConfig = validSSHConfig.config;
            logger.info(`Running autodiscovery script on SSH host ${validSSHConfig.sshHostName} (could take several minutes)...`);
            const ssmTargetId = await quickstartService.runAutodiscoveryOnSSHHost(sshConfig, validSSHConfig.sshHostName);
            logger.info(`Bastion assigned SSH host ${validSSHConfig.sshHostName} with the following unique target id: ${ssmTargetId}`);

            // Poll for "Online" status
            logger.info(`Waiting for target ${validSSHConfig.sshHostName} to become online (could take several minutes)...`);
            const ssmTarget = await quickstartService.pollSsmTargetOnline(ssmTargetId);
            logger.info(`SSH host ${validSSHConfig.sshHostName} successfully added to BastionZero!`);
            didRegisterAtLeastOne = true;

            // Gather some extra information from Bastion if this is the target
            // user specified to connect to at the end.
            if (shouldConnectAfter && validSSHConfig.sshHostName === targetToConnectToAtEnd.name) {
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
            logger.error(`Failed to add SSH host: ${validSSHConfig.sshHostName} to BastionZero. ${error}`);
        }
    }

    let exitCode = didRegisterAtLeastOne ? 0 : 1;
    if (targetToConnectToAtEndAsParsedTargetString) {
        logger.info(`Connecting to ${targetToConnectToAtEnd.name}...`);
        exitCode = await connectHandler(configService, logger, mixpanelService, targetToConnectToAtEndAsParsedTargetString);
    }

    if (didRegisterAtLeastOne) {
        logger.info('Use `zli connect` to connect to your registered targets.');
    }

    await cleanExit(exitCode, logger);
}