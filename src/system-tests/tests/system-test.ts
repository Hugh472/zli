import { CliDriver, envMap } from '../../cli-driver';
import { DigitalOceanDistroImage, DigitalOceanRegion, DigitalOceanSSMTarget, getDOImageName, SsmTargetStatusPollError } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanSSMTargetService } from '../digital-ocean/digital-ocean-ssm-target-service';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { OAuthService } from '../../services/oauth/oauth.service';
import { randomAlphaNumericString } from '../../utils/utils';
import { connectSuite } from './suites/connect';
import { listTargetsSuite } from './suites/list-targets';
import { versionSuite } from './suites/version';
import * as CleanExitHandler from '../../handlers/clean-exit.handler';

// Uses config name from ZLI_CONFIG_NAME environment variable (defaults to prod
// if unset) This can be run against dev/stage/prod when running system tests
// locally using your own configuration file. When running as part of the CI/CD
// pipeline in the AWS dev account this will be 'dev' and when running as part
// of the CD pipeline in the AWS prod account it will be 'stage'
const configName = envMap.configName;

// Setup services used for running system tests
const loggerConfigService = new LoggerConfigService(configName, envMap.configDir);
const logger = new Logger(loggerConfigService, false, false, true);
const configService = new ConfigService(configName, logger, envMap.configDir);
const oauthService = new OAuthService(configService, logger);
const doApiKey = process.env.DO_API_KEY;
if (!doApiKey) {
    throw new Error('Must set the DO_API_KEY environment variable');
}
const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);

// Global mapping of system test targets
export const testTargets = new Map<DigitalOceanDistroImage, DigitalOceanSSMTarget>();

// Images to use during system tests. Each image corresponds to a new droplet
export const imagesToRun: DigitalOceanDistroImage[] = [
    DigitalOceanDistroImage.AmazonLinux2,
    // DigitalOceanDistroImage.CentOS8,
    DigitalOceanDistroImage.Debian11,
    DigitalOceanDistroImage.Ubuntu20
];

export async function callZli(zliArgs: string[], callback: (err: Error, argv: any, output: string) => Promise<void>): Promise<void> {
    // Spy on calls to cleanExit but dont call process.exit. Still throw an
    // exception if exitCode != 0 which will fail the test
    jest.spyOn(CleanExitHandler, 'cleanExit').mockImplementation(async (exitCode) => {
        if (exitCode !== 0) {
            throw new Error(`cleanExit was called with exitCode == ${exitCode}`);
        }
    });

    const cliDriver = new CliDriver();
    const callbackComplete = new Promise<void>(async (res, rej) => {
        try {
            await cliDriver.getCliDriver(true).parseAsync(zliArgs, {}, async (err, argv, output) => {
                try {
                    await callback(err, argv, output);
                    res();
                } catch (e) {
                    rej(e);
                }
            });
        } catch (e) {
            rej(e);
        }
    });

    await callbackComplete;
}

// Setup all droplets before running tests
beforeAll(async () => {
    // Refresh the ID token because it is likely expired
    await oauthService.getIdTokenAndExitOnError();

    // Create a droplet for various images
    const createDroplet = async (image: DigitalOceanDistroImage) => {
        const targetName = `${getDOImageName(image)}-${randomAlphaNumericString(15)}-system-test`;
        const droplet = await doService.createDigitalOceanSSMTarget({
            targetName: targetName,
            dropletParameters: {
                dropletName: targetName,
                dropletSize: 's-1vcpu-1gb',
                dropletImage: image,
                dropletRegion: DigitalOceanRegion.NewYork1,
                dropletTags: ['system-tests'],
            }
        });

        // Add the digital ocean droplet to test targets mapping so that we can clean it up in afterAll
        const digitalOceanSsmTarget: DigitalOceanSSMTarget = { droplet: droplet, ssmTarget: undefined };
        testTargets.set(image, digitalOceanSsmTarget);

        try {
            const ssmTarget = await doService.pollSsmTargetOnline(targetName);
            // Set the ssmTarget associated with this digital ocean droplet
            digitalOceanSsmTarget.ssmTarget = ssmTarget;
        } catch (err) {
            // Catch special exception so that we can save ssmTarget reference
            // for cleanup.
            //
            // SsmTargetStatusPollError is thrown if target reaches 'Error'
            // state, or if target is known but does not come online within the
            // specified timeout.
            if (err instanceof SsmTargetStatusPollError) {
                digitalOceanSsmTarget.ssmTarget = err.ssmTarget;
            }

            // Still throw the error because something failed. No other system
            // tests should continue if one target fails to become Online.
            throw err;
        }

        console.log(
            `Successfully created DigitalOceanSSMTarget:
            \tDroplet ID: ${digitalOceanSsmTarget.droplet.id}
            \tDroplet Image: ${getDOImageName(image)}
            \tTarget ID: ${digitalOceanSsmTarget.ssmTarget.id}`
        );
    };

    // Issue create droplet requests concurrently
    const allDropletCreationResults = await Promise.allSettled(imagesToRun.map(img => createDroplet(img)));
    if (allDropletCreationResults.some((p) => p.status === 'rejected')) {
        const failedImagesResults = allDropletCreationResults.filter(p => p.status === 'rejected');
        failedImagesResults.forEach((failedResult: PromiseRejectedResult) => console.log(failedResult.reason));
        throw new Error('Failed to create some droplets in test setup');
    }
}, 600 * 1000);

// Cleanup droplets after running all tests
afterAll(async () => {
    let didSomethingFailInCleanup: boolean = false;
    for (const doTarget of Array.from(testTargets.values())) {
        // Cleanup!
        const [dropletDeletionResult, targetDeletionResult] = await doService.deleteDigitalOceanSSMTarget(doTarget);

        // Log errors if failed
        if (dropletDeletionResult.status === 'rejected') {
            console.log(dropletDeletionResult.reason);
            didSomethingFailInCleanup = true;
        };
        if (targetDeletionResult.status === 'rejected') {
            console.log(targetDeletionResult.reason);
            didSomethingFailInCleanup = true;
        };
    }

    if (didSomethingFailInCleanup) {
        throw new Error('Test cleanup was not successful');
    }
}, 60 * 1000);

// Call various test suites
connectSuite();
versionSuite();
listTargetsSuite();