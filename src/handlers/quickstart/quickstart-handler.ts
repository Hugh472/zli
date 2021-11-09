import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { QuickstartSsmService } from '../../services/quickstart/quickstart-ssm.service';
import { MixpanelService } from '../../services/mixpanel/mixpanel.service';
import { EnvironmentService } from '../../services/environment/environment.service';
import { PolicyService } from '../../services/policy/policy.service';
import { readFile } from '../../utils';
import { SsmTargetSummary } from '../../services/ssm-target/ssm-target.types';
import { defaultSshConfigFilePath, quickstartArgs } from './quickstart.command-builder';
import { OAuthService } from '../../services/oauth/oauth.service';
import { UserSummary } from '../../services/user/user.types';
import { version } from '../../../package.json';

import prompts, { PromptObject } from 'prompts';
import yargs from 'yargs';
import fs from 'fs';
import { ConsoleWithTranscriptService } from '../../services/consoleWithTranscript/consoleWithTranscript.service';
import chalk from 'chalk';
import { TranscriptMessage } from '../../services/consoleWithTranscript/consoleWithTranscript.types';
import ora from 'ora';
import { login } from '../login/login.handler';
import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';

const welcomeMessage = `Welcome to BastionZero and the journey to zero trust access via our multi root zero trust access protocol (MrZAP). We're excited to have you!\n
Our quickstart installer is a fast and easy method for you to try BastionZero using your existing SSH configuration.
We will use the following information supplied by your SSH configuration file to onboard the targets:\n
Host ${chalk.bold.yellowBright('your_host_name')}
    HostName ${chalk.bold.yellowBright('your.ip.address')}
    User ${chalk.bold.yellowBright('your_username')}
    IdentityFile ${chalk.bold.yellowBright('path/to/your/.ssh/.pem/file')}
    Port ${chalk.bold.yellowBright('specify_port_number_if_desired')}
`;

const loginMessage = `Below, when you press the key to continue a browser window will appear.\nLogin with your SSO provider. Doing so will automatically create your BastionZero account.\nPress any key to continue...`;

const tipsMessage = `While your target(s) are coming online, here are a few tips to best utilize the zli:
  (1) To list all of your targets, use \`zli list-targets\` or \`zli lt\`
  (2) To connect to a target, use \`zli connect user@targetName\`
  (3) To see your policies, use \`zli policy\`
\nView the zli manual at: https://bastionzero.freshdesk.com/support/solutions/articles/67000629821-zero-trust-command-line-interface-zli-manual
\nIf you’re wondering what’s happening in the background -- We are using your SSH key to install the BastionZero agent onto your machine(s). These agents protect your hosts from unprivileged access, even from BastionZero, thanks to our Multi Root Zero Trust Access protocol. To learn more about the protocol, please take a look at: https://github.com/bastionzero/whitepapers/blob/main/mrzap/README.md`;

function printFooterMessage(): void {
    console.log('To see the full suite of capabilities that BastionZero offers, take a look at our documentation at: https://bastionzero.freshdesk.com/support/home');
}

function getFirstName(userSummary: UserSummary): string | undefined {
    if (userSummary && userSummary.fullName) {
        return userSummary.fullName.substr(0, userSummary.fullName.indexOf(' '));
    } else {
        return undefined;
    }
}

function isAdmin(userSummary: UserSummary): boolean {
    return userSummary && userSummary.isAdmin;
}

async function postSuccessLogin(userSummary: UserSummary, getWelcomeMsg: (firstName: string) => string | undefined, logger: Logger, consoleWithTranscript: ConsoleWithTranscriptService): Promise<void> {
    if (!isAdmin(userSummary)) {
        consoleWithTranscript.log(chalk.red('This is an admin restricted command. Please login as an admin to perform it.'));
        await cleanExit(1, logger);
    }

    const firstName = getFirstName(userSummary);
    const welcomeMsg = getWelcomeMsg(firstName);
    if (welcomeMsg) {
        consoleWithTranscript.log(chalk.green(welcomeMsg));
    }
}

function clearScreen() {
    // Source: https://stackoverflow.com/a/14976765

    // Clears the screen while preserving scrollback. Resets cursor to (0,0)
    process.stdout.write('\u001b[2J\u001b[0;0H');
}

async function validateQuickstartArgs(argv: yargs.Arguments<quickstartArgs>) {
    // OS check
    if (process.platform === 'win32') {
        throw new Error('Quickstart is not supported on Windows machines');
    }

    // Check sshConfigFile parameter
    if (argv.sshConfigFile === undefined) {
        // User did not pass in sshConfigFile parameter. Use default parameter
        argv.sshConfigFile = defaultSshConfigFilePath;
        if (!fs.existsSync(argv.sshConfigFile)) {
            throw new Error(`Cannot read/access file at default path: ${argv.sshConfigFile}\nUse \`zli quickstart --sshConfigFile <filePath>\` to read a different file`);
        }
    } else {
        // User passed in sshConfigFile
        if (!fs.existsSync(argv.sshConfigFile)) {
            throw new Error(`Cannot read/access file at path: ${argv.sshConfigFile}`);
        }
    }
}

async function exitAndSaveTranscript(exitCode: number, logger: Logger, transcript: readonly TranscriptMessage[]): Promise<void> {
    const transcriptSaveResponse = await prompts({
        type: 'toggle',
        name: 'value',
        message: 'Would you like a copy of your logs from running the QuickStart installer? (file will be saved in current working directory)',
        initial: true,
        active: 'yes',
        inactive: 'no',
    }, { onCancel: async () => { printFooterMessage(); await cleanExit(1, logger); }, });
    const wantsTranscript: boolean = transcriptSaveResponse.value;

    if (wantsTranscript) {
        const formattedTranscript = transcript.reduce((acc, msg) => acc + msg.text + '\n', '');

        // Get time as pretty string
        const currentTime = new Date();
        const year = currentTime.getFullYear();
        const month = currentTime.getMonth() + 1; // getMonth() is zero-based
        const day = currentTime.getDate();
        const hours = currentTime.getHours();
        const minutes = currentTime.getMinutes();
        const seconds = currentTime.getSeconds();
        const prettyTime = `${year}-${month}-${day}-${hours}_${minutes}_${seconds}`;

        // Write to file in current directory
        fs.writeFileSync(`quickstart-logs-${prettyTime}.txt`, formattedTranscript);
    }

    printFooterMessage();
    await cleanExit(exitCode, logger);
}

export async function quickstartHandler(
    argv: yargs.Arguments<quickstartArgs>,
    logger: Logger,
    keysplittingService: KeySplittingService,
    configService: ConfigService
) {
    await validateQuickstartArgs(argv);

    const policyService = new PolicyService(configService, logger);
    const envService = new EnvironmentService(configService, logger);
    const consoleWithTranscript = new ConsoleWithTranscriptService(chalk.magenta);

    // Callback on cancel prompt
    const onCancelPrompt = async (prompt: PromptObject) => {
        consoleWithTranscript.pushToTranscript(`${prompt.message}`);
        consoleWithTranscript.log('Prompt cancelled. Exiting out of quickstart...');

        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    };
    // Callback on submit prompt
    const onSubmitPrompt = (prompt: PromptObject, answer: any) => {
        consoleWithTranscript.pushToTranscript(`${prompt.message} ${answer}`);
    };

    const quickstartService = new QuickstartSsmService(logger, consoleWithTranscript, configService, policyService, envService);

    // Clear console before we begin
    clearScreen();

    // Present welcome message / value proposition
    consoleWithTranscript.log(chalk.blue(welcomeMessage));

    // Local function to handle "press any key" functionality in login step
    // Source: https://stackoverflow.com/a/49959557
    const waitForKeypress = async () => {
        process.stdin.setRawMode(true);
        return new Promise<void>(resolve => process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            resolve();
        }));
    };

    consoleWithTranscript.log(chalk.bold.white('(Step 1/4) Login'));
    const oauthService = new OAuthService(configService, logger);
    try {
        // Run standard oauth middleware logic that checks if user is logged in
        // and refreshes token if its expired.
        await oauthService.getIdToken();

        await postSuccessLogin(configService.me(), (firstName) => {
            if (firstName) {
                return `\nWelcome back ${firstName}!`;
            }
        }, logger, consoleWithTranscript);

        consoleWithTranscript.log(`Check out ${configService.getBastionUrl()} to see your environments, policies, and detailed logs.`);
        consoleWithTranscript.log('Press any key to continue...');
        await waitForKeypress();
    } catch (err) {
        // Present login message
        consoleWithTranscript.log(loginMessage);
        await waitForKeypress();

        const loginResult = await login(keysplittingService, configService, logger);
        if (loginResult) {
            await postSuccessLogin(loginResult.userSummary, (firstName) => {
                if (firstName) {
                    return `\nWelcome ${firstName}!`;
                }
            }, logger, consoleWithTranscript);
        } else {
            // User cancelled MFA prompt
            await cleanExit(1, logger);
        }
    }

    // New step so clear screen
    clearScreen();

    // We cannot create the MixpanelService until the user has logged in
    if (!configService.mixpanelToken()) {
        // Fetch the mixpanel token in case it is not set (first time user)
        await configService.fetchMixpanelToken();
    }
    const mixpanelService = new MixpanelService(configService);
    mixpanelService.TrackCliCommand(version, 'quickstart', []);

    // Parse SSH config file
    consoleWithTranscript.log(`Parsing SSH config file: ${argv.sshConfigFile}`);
    const sshConfigFileAsStr = await readFile(argv.sshConfigFile);
    const [parsedSSHHosts] = quickstartService.parseSSHHosts(sshConfigFileAsStr);
    const validSSHHosts = await quickstartService.getSSHHostsWithValidSSHKeys(parsedSSHHosts);

    consoleWithTranscript.log(`\nFound ${validSSHHosts.size} valid SSH hosts!\nUsing your ssh keys, we’ll install the BastionZero agent for whichever hosts you choose.`);

    // Fail early if there are no valid hosts to choose from
    if (validSSHHosts.size == 0) {
        consoleWithTranscript.log('No valid hosts found. Exiting out of quickstart...');

        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    }

    consoleWithTranscript.log('Press CTRL-C to exit at any time.\n');

    // Prompt user with selection of hosts
    const hostsResponse = await prompts({
        type: 'multiselect',
        name: 'value',
        message: '(Step 2/4) Which SSH hosts do you want to connect with BastionZero?',
        choices: Array.from(validSSHHosts.keys()).map(hostName => ({ title: hostName, value: hostName } as prompts.Choice)),
        instructions: 'Use space to select your hosts and up/down arrows to navigate between hosts. Press return to submit.'
    }, { onCancel: onCancelPrompt, onSubmit: onSubmitPrompt });
    const selectedHostsNames: string[] = hostsResponse.value;

    if (selectedHostsNames.length == 0) {
        consoleWithTranscript.log('No hosts selected. Exiting out of quickstart...');

        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    }

    // Convert list of selected ValidSSHHosts to SSHConfigs to use with the
    // ssh2-promise library. This conversion is interactive. It will prompt the
    // user to provide a passphrase if any of the selected hosts' IdentityFiles
    // are encrypted.
    const validSSHConfigs = await quickstartService.promptConvertValidSSHHostsToSSHConfigs(
        selectedHostsNames.map(hostName => validSSHHosts.get(hostName)),
        exitAndSaveTranscript,
        onSubmitPrompt,
        onCancelPrompt);

    // Fail early if the validation check above removed all valid hosts
    if (validSSHConfigs.length == 0) {
        consoleWithTranscript.log('All selected hosts were removed from list of SSH hosts to add to BastionZero. Exiting out of quickstart...');
        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    }

    // New step. Clear screen
    clearScreen();

    // Ask the user if they're ready to begin
    const prettyHostsToAttemptAutodisocvery: string = validSSHConfigs.map(config => `\t- ${config.sshHost.name}`).join('\n');
    const readyResponse = await prompts({
        type: 'toggle',
        name: 'value',
        message: `(Step 3/4) Please confirm that you want to add:\n\n${prettyHostsToAttemptAutodisocvery}\n\nto BastionZero:`,
        initial: true,
        active: 'yes',
        inactive: 'no',
    }, { onCancel: onCancelPrompt, onSubmit: onSubmitPrompt });
    const isReady: boolean = readyResponse.value;

    if (!isReady) {
        consoleWithTranscript.log('Exiting out of quickstart...');
        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    }

    // New step so clear again
    clearScreen();

    // Create environment for each unique username parsed from the SSH config
    const registrableHosts = await quickstartService.createEnvForUniqueUsernames(validSSHConfigs);
    if (registrableHosts.length == 0) {
        consoleWithTranscript.log('None of the selected hosts are registrable. Exiting out of quickstart...');
        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    }

    const registrableHostsPrettyString = registrableHosts.map(regHost => regHost.host.sshHost.name).join(', ');
    const postSpinnerSymbolMsg = `(Step 4/4) Securing host(s) ${registrableHostsPrettyString} with BastionZero\n\n${tipsMessage}\n`;
    consoleWithTranscript.pushToTranscript(postSpinnerSymbolMsg);
    const spinner = ora({ text: postSpinnerSymbolMsg, prefixText: '' });

    // Register SIGINT handler to catch CTRL-C only when spinner is running
    process.on('SIGINT', async function () {
        if (spinner.isSpinning) {
            // Stop the spinner and persist the mutated prefixText
            spinner.text = '';
            spinner.stopAndPersist();

            consoleWithTranscript.log('User cancelled execution. Exiting out of quickstart...');
            await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
        }
    });

    // Start spinner after registering SIGINT
    spinner.start();

    // Run autodiscovery script on all hosts concurrently
    const autodiscoveryResultsPromise = Promise.allSettled(registrableHosts.map(host => quickstartService.addSSHHostToBastionZero(host, spinner)));

    // Await for **all** hosts to either come "Online" or error
    const autodiscoveryResults = await autodiscoveryResultsPromise;

    // Stop the spinner and persist the mutated prefixText
    spinner.text = '';
    spinner.stopAndPersist();

    const ssmTargetsSuccessfullyAdded = autodiscoveryResults.reduce<SsmTargetSummary[]>((acc, result) => result.status === 'fulfilled' ? [...acc, result.value] : acc, []);

    // Exit early if all hosts failed
    if (ssmTargetsSuccessfullyAdded.length == 0) {
        consoleWithTranscript.log('Failed to add all selected hosts. Exiting out of quickstart...');
        await exitAndSaveTranscript(1, logger, consoleWithTranscript.getTranscript());
    }

    // Create policy for each unique username parsed from the SSH config
    await quickstartService.createPolicyForUniqueUsernames(
        ssmTargetsSuccessfullyAdded.map(target => ({ ssmTarget: target, sshHost: validSSHHosts.get(target.name) }))
    );

    // New step so clear again
    clearScreen();

    const ssmTargetsSuccessfullyAddedPretty = ssmTargetsSuccessfullyAdded.map(target => target.name).join(', ');
    const successMessage = `Congratulations! You've secured access to your target(s): ${ssmTargetsSuccessfullyAddedPretty} with MrZAP using BastionZero.\n
Log into ${configService.getBastionUrl()} to see your environments, policies, and detailed logs.`;
    consoleWithTranscript.log(successMessage);

    consoleWithTranscript.log('Use `zli connect` to connect to your newly registered targets.');
    for (const target of ssmTargetsSuccessfullyAdded) {
        const sshHost = validSSHHosts.get(target.name);
        consoleWithTranscript.log(`\tzli connect ${sshHost.username}@${target.name}`);
    }

    await exitAndSaveTranscript(0, logger, consoleWithTranscript.getTranscript());
}