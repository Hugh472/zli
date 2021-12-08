import { envMap } from '../../cli-driver';
import { DigitalOceanDistroImage, DigitalOceanSSMTarget, getDOImageName, SsmTargetStatusPollError } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanSSMTargetService } from '../digital-ocean/digital-ocean-ssm-target-service';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { OAuthService } from '../../services/oauth/oauth.service';
import { randomAlphaNumericString } from '../../utils/utils';
import { connectSuite } from './suites/connect';
import { listTargetsSuite } from './suites/list-targets';
import { versionSuite } from './suites/version';
import { DigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { ClusterTargetStatusPollError, DigitalOceanKubernetesClusterVersion, RegisteredDigitalOceanKubernetesCluster } from '../digital-ocean/digital-ocean-kube.service.types';
import { DigitalOceanKubeService } from '../digital-ocean/digital-ocean-kube-service';
import { ApiKeyService } from '../../services/api-key/api-key.service';
import { NewApiKeyResponse } from '../../services/api-key/api-key.types';
import { kubeSuite } from './suites/kube';
import { promisify } from 'util';
import fs from 'fs';
import { addRepo, install, MultiStringValue, SingleStringValue } from './utils/helm/helm-utils';
import { checkAllSettledPromise, stripTrailingSlash } from './utils/utils';

// Uses config name from ZLI_CONFIG_NAME environment variable (defaults to prod
// if unset) This can be run against dev/stage/prod when running system tests
// locally using your own configuration file. When running as part of the CI/CD
// pipeline in the AWS dev account this will be 'dev' and when running as part
// of the CD pipeline in the AWS prod account it will be 'stage'
const configName = envMap.configName;

// Setup services used for running system tests
const loggerConfigService = new LoggerConfigService(configName, envMap.configDir);
const logger = new Logger(loggerConfigService, false, false, true);
export const configService = new ConfigService(configName, logger, envMap.configDir);
const oauthService = new OAuthService(configService, logger);
const doApiKey = process.env.DO_API_KEY;
if (!doApiKey) {
    throw new Error('Must set the DO_API_KEY environment variable');
}
const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);
const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);

const agentVersion = process.env.KUBE_AGENT_VERSION;
if(! agentVersion) {
    throw new Error('Must set the KUBE_AGENT_VERSION environment variable');
}

// Create a new API Key to be used for cluster registration
const apiKeyService = new ApiKeyService(configService, logger);
let systemTestApiKey: NewApiKeyResponse;

// Global mapping of system test targets
export const testTargets = new Map<DigitalOceanDistroImage, DigitalOceanSSMTarget>();

// Images to use during system tests. Each image corresponds to a new droplet
export const imagesToRun: DigitalOceanDistroImage[] = [
    DigitalOceanDistroImage.AmazonLinux2,
    // DigitalOceanDistroImage.CentOS8,
    DigitalOceanDistroImage.Debian11,
    DigitalOceanDistroImage.Ubuntu20
];

// Global mapping of Kubernetes cluster targets
export const testClusters = new Map<DigitalOceanKubernetesClusterVersion, RegisteredDigitalOceanKubernetesCluster>();

// Kubernetes cluster versions to use during system tests. Each version corresponds to a new cluster.
export const clusterVersionsToRun: DigitalOceanKubernetesClusterVersion[] = [
    DigitalOceanKubernetesClusterVersion.LatestVersion
];

export const systemTestUniqueId = randomAlphaNumericString(15).toLowerCase();

// Setup all droplets before running tests
beforeAll(async () => {
    // Refresh the ID token because it is likely expired
    await oauthService.getIdTokenAndExitOnError();

    // Create a new api key that can be used for system tests
    await setupSystemTestApiKey();

    await checkAllSettledPromise(Promise.allSettled([
        createDOTestTargets(),
        createDOTestClusters()
    ]));
}, 20 * 60 * 1000);

// Cleanup droplets after running all tests
afterAll(async () => {
    // Delete the API key created for system tests
    await cleanupSystemTestApiKey();

    await checkAllSettledPromise(Promise.allSettled([
        cleanupDOTestTargets(),
        cleanupDOTestClusters()
    ]));
}, 60 * 1000);


async function createDOTestClusters() {
    // Create a cluster for various versions
    const createCluster = async (version: DigitalOceanKubernetesClusterVersion) => {
        const clusterName = `system-test-${systemTestUniqueId}`;
        const cluster = await doKubeService.createDigitalOceanKubeCluster({
            clusterName: clusterName,
            clusterRegion: DigitalOceanRegion.NewYork1,
            clusterVersion: version,
            clusterNodePools: [{
                workerDropletSize: 's-4vcpu-8gb',
                nodePoolName: 'test-node-pool',
                dropletInstancesCount: 1,
                autoScaleParameters: {
                    minNodes: 1,
                    maxNodes: 4
                }
            }],
            clusterTags: ['system-tests'],
        });

        // Add the digital ocean cluster to test cluster targets mapping so that
        // we can clean it up in afterAll
        const clusterToRegister: RegisteredDigitalOceanKubernetesCluster = {
            doClusterSummary: cluster,
            kubeConfigFileContents: undefined,
            bzeroClusterTargetSummary: undefined
        };
        testClusters.set(version, clusterToRegister);

        // Poll DigitalOcean until cluster has entered "running" state. Update
        // mapping with latest retrieved state of cluster.
        const clusterSummary = await doKubeService.pollClusterRunning(cluster);
        clusterToRegister.doClusterSummary = clusterSummary;

        // Get the config file
        const kubeConfigFileContents = await doKubeService.getClusterKubeConfig(cluster);
        clusterToRegister.kubeConfigFileContents = kubeConfigFileContents;

        console.log(`Config retrieved: ${kubeConfigFileContents}`);

        // Write to file
        const kubeConfigPath = '/tmp/do-kubeconfig.yml';
        await promisify(fs.writeFile)(kubeConfigPath, kubeConfigFileContents, {mode: '0600'});

        const helmChartName = 'bctlquickstart';
        const helmChart = 'bastionzero/bctl-quickstart';
        const helmVariables: { [key: string]: SingleStringValue | MultiStringValue } = {
            // helm chart expects the service to not cannot contain a
            // trailing slash and our config service includes the slash
            'serviceUrl': { value: stripTrailingSlash(configService.serviceUrl()), type: 'single' },
            'image.agentTag': { value: agentVersion, type: 'single'},
            'apiKey': { value: systemTestApiKey.secret, type: 'single' },
            'clusterName': { value: cluster.name, type: 'single' },
            'users': { value: [configService.me().email], type: 'multi' },
            'targetUsers': { value: ['foo'], type: 'multi' },
            'targetGroups': { value: ['system:masters'], type: 'multi' },
            'namespace': { value: 'bastionzero', type: 'single' },
            'agentResources.limits.cpu': { value: '500m', type: 'single' },
            'agentResources.requests.cpu': { value: '500m', type: 'single' },
            'quickstartResources.limits.cpu': { value: '500m', type: 'single' },
            'quickstartResources.requests.cpu': { value: '500m', type: 'single' }
        };

        // Ensure bastionzero helm chart repo is added
        await addRepo('bastionzero', 'https://bastionzero.github.io/charts/');

        // install bastionzero helm chart
        await install(helmChartName, helmChart, kubeConfigPath, helmVariables);

        // This should be pretty quick as helm install should not finish until
        // target is online
        try {
            const clusterSummary = await doKubeService.pollClusterTargetOnline(cluster.name);
            // Set the cluster target summary associated with this digital ocean
            // cluster
            clusterToRegister.bzeroClusterTargetSummary = clusterSummary;
        } catch (err) {
            // Catch special exception so that we can save cluster target
            // summary reference for cleanup.
            //
            // ClusterTargetStatusPollError is thrown if target reaches 'Error'
            // state, or if target is known but does not come online within the
            // specified timeout.
            if (err instanceof ClusterTargetStatusPollError) {
                clusterToRegister.bzeroClusterTargetSummary = err.clusterSummary;
            }

            // Still throw the error because something failed. No other system
            // tests should continue if one target fails to become Online.
            throw err;
        }

        console.log(
            `Successfully created RegisteredDigitalOceanKubernetesCluster:
            \tCluster Name: ${clusterToRegister.doClusterSummary.name}
            \tCluster ID: ${clusterToRegister.doClusterSummary.id}
            \tCluster Version: ${clusterToRegister.doClusterSummary.version}
            \tTarget ID: ${clusterToRegister.bzeroClusterTargetSummary.id}`
        );
    };

    // Issue create cluster requests concurrently
    const allClusterCreationResults = Promise.allSettled(clusterVersionsToRun.map(version => createCluster(version)));
    await checkAllSettledPromise(allClusterCreationResults);
}

async function createDOTestTargets() {
    // Create a droplet for various images
    const createDroplet = async (image: DigitalOceanDistroImage) => {
        const targetName = `system-test-${systemTestUniqueId}-${getDOImageName(image)}`;
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
    const allDropletCreationResults = Promise.allSettled(imagesToRun.map(img => createDroplet(img)));
    await checkAllSettledPromise(allDropletCreationResults);
}

async function cleanupDOTestClusters() {
    const allClustersCleanup = Promise.allSettled(Array.from(testClusters.values()).map(doCluster => {
        return doKubeService.deleteRegisteredKubernetesCluster(doCluster);
    }));

    await checkAllSettledPromise(allClustersCleanup);
}

async function cleanupDOTestTargets() {
    const allTargetsCleanup = Promise.allSettled(Array.from(testTargets.values()).map((doTarget) => {
        return doService.deleteDigitalOceanSSMTarget(doTarget);
    }));

    await checkAllSettledPromise(allTargetsCleanup);
}

async function setupSystemTestApiKey() {
    const apiKeyName = `system-test-${systemTestUniqueId}-api-key`;
    systemTestApiKey = await apiKeyService.createNewApiKey({ name: apiKeyName, isRegistrationKey: false });
    console.log('created api key ' + systemTestApiKey.apiKeyDetails.id);
}

async function cleanupSystemTestApiKey() {
    await apiKeyService.deleteApiKey({ id: systemTestApiKey.apiKeyDetails.id });
}

// Call various test suites
versionSuite();
listTargetsSuite();
connectSuite();
kubeSuite();