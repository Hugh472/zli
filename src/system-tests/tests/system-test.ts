import { envMap } from '../../cli-driver';
import { BzeroTargetStatusPollError, DigitalOceanBZeroTarget, DigitalOceanDistroImage, DigitalOceanSSMTarget, getDOImageName, getPackageManagerType, SsmTargetStatusPollError } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanSSMTargetService } from '../digital-ocean/digital-ocean-ssm-target-service';
import { LoggerConfigService } from '../../services/logger/logger-config.service';
import { Logger } from '../../services/logger/logger.service';
import { ConfigService } from '../../services/config/config.service';
import { OAuthService } from '../../services/oauth/oauth.service';
import { getEnvironmentFromName, randomAlphaNumericString } from '../../utils/utils';
import { connectSuite } from './suites/connect';
import { listTargetsSuite } from './suites/list-targets';
import { versionSuite } from './suites/version';
import { convertAwsRegionToDigitalOceanRegion, DigitalOceanRegion } from '../digital-ocean/digital-ocean.types';
import { ClusterTargetStatusPollError, DigitalOceanKubernetesClusterVersion, RegisteredDigitalOceanKubernetesCluster } from '../digital-ocean/digital-ocean-kube.service.types';
import { DigitalOceanKubeService } from '../digital-ocean/digital-ocean-kube-service';
import { kubeSuite } from './suites/kube';
import { promisify } from 'util';
import fs from 'fs';
import { addRepo, install, MultiStringValue, SingleStringValue } from './utils/helm/helm-utils';
import { checkAllSettledPromise, stripTrailingSlash } from './utils/utils';
import { ApiKeyHttpService } from '../../http-services/api-key/api-key.http-services';
import { NewApiKeyResponse } from '../../../webshell-common-ts/http/v2/api-key/responses/new-api-key.responses';
import { SSMTestTargetSelfRegistrationAutoDiscovery, TestTarget, VTTestTarget } from './system-test.types';
import { getAutodiscoveryScript } from '../../http-services/auto-discovery-script/auto-discovery-script.http-services';
import { ScriptTargetNameOption } from '../../../webshell-common-ts/http/v2/autodiscovery-script/types/script-target-name-option.types';
import { EnvironmentHttpService } from '../../http-services/environment/environment.http-services';
import { vtSuite } from './suites/vt';
import { KubeTestUserName } from './suites/kube';

// Uses config name from ZLI_CONFIG_NAME environment variable (defaults to prod
// if unset) This can be run against dev/stage/prod when running system tests
// locally using your own configuration file. When running as part of the CI/CD
// pipeline in the AWS dev account this will be 'dev' and when running as part
// of the CD pipeline in the AWS prod account it will be 'stage'
const configName = envMap.configName;

// Setup services used for running system tests
const loggerConfigService = new LoggerConfigService(configName, envMap.configDir);
export const logger = new Logger(loggerConfigService, false, false, true);
export const configService = new ConfigService(configName, logger, envMap.configDir);
const oauthService = new OAuthService(configService, logger);
const doApiKey = process.env.DO_API_KEY;
if (!doApiKey) {
    throw new Error('Must set the DO_API_KEY environment variable');
}
const doService = new DigitalOceanSSMTargetService(doApiKey, configService, logger);
const doKubeService = new DigitalOceanKubeService(doApiKey, configService, logger);

const bzeroAgentVersion = process.env.BZERO_AGENT_VERSION;
if(! bzeroAgentVersion) {
    throw new Error('Must set the BZERO_AGENT_VERSION environment variable');
}

const bctlQuickstartVersion = process.env.BCTL_QUICKSTART_VERSION;
if (! bctlQuickstartVersion) {
    throw new Error('Must set the BCTL_QUICKSTART_VERSION environment variable');
}

const KUBE_ENABLED = process.env.KUBE_ENABLED ? (process.env.KUBE_ENABLED === 'true') : true;
const VT_ENABLED = process.env.VT_ENABLED ? (process.env.VT_ENABLED === 'true') : true;
const SSM_ENABLED =  process.env.SSM_ENABLED ? (process.env.SSM_ENABLED === 'true') : true;

// Create a new API Key to be used for cluster registration
const apiKeyService = new ApiKeyHttpService(configService, logger);
let systemTestRESTApiKey: NewApiKeyResponse;
// Create a new API key to be used for self-registration SSM test targets
let systemTestRegistrationApiKey: NewApiKeyResponse;

// Global mapping of system test targets
export const testTargets = new Map<TestTarget, DigitalOceanSSMTarget | DigitalOceanBZeroTarget >();

const defaultAwsRegion = 'us-east-1';
const defaultDigitalOceanRegion = convertAwsRegionToDigitalOceanRegion(defaultAwsRegion);

// Different types of SSM test targets to create. Each object corresponds to a
// new droplet.
export const ssmTestTargetsToRun: TestTarget[] = [
    // old autodiscovery script (all-in-bash)
    { installType: 'ad', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion },
    // { type: 'autodiscovery', dropletImage: DigitalOceanDistroImage.CentOS8 },
    { installType: 'ad', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion },
    { installType: 'ad', dropletImage: DigitalOceanDistroImage.Ubuntu20, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion },
    // new autodiscovery script (self-registration)
    { installType: 'pm', dropletImage: DigitalOceanDistroImage.Debian11, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion },
    { installType: 'pm', dropletImage: DigitalOceanDistroImage.AmazonLinux2, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion },
];

// Different types of vt targets to create for each type of operating system
export const vtTestTargetsToRun: TestTarget[] = [
    { installType: 'pm-vt', dropletImage: DigitalOceanDistroImage.BzeroVTAL2TestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion},
    { installType: 'pm-vt', dropletImage: DigitalOceanDistroImage.BzeroVTUbuntuTestImage, doRegion: defaultDigitalOceanRegion, awsRegion: defaultAwsRegion}
];

// Add extra targets to test config based on EXTRA_REGIONS env var
initRegionalSSMTargetsTestConfig();

export let allTargets: TestTarget[] = [];
if(SSM_ENABLED) {
    allTargets = allTargets.concat(ssmTestTargetsToRun);
} else {
    logger.info(`Skipping adding ssm targets because SSM_ENABLED is false`);
}

if(VT_ENABLED) {
    allTargets = allTargets.concat(vtTestTargetsToRun);
} else {
    logger.info(`Skipping adding vt targets because SSM_ENABLED is false`);
}

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
    await setupSystemTestApiKeys();

    await checkAllSettledPromise(Promise.allSettled([
        createDOTestTargets(),
        createDOTestClusters()
    ]));
}, 20 * 60 * 1000);

// Cleanup droplets after running all tests
afterAll(async () => {
    // Delete the API key created for system tests
    await cleanupSystemTestApiKeys();

    await checkAllSettledPromise(Promise.allSettled([
        cleanupDOTestTargets(),
        cleanupDOTestClusters()
    ]));
}, 60 * 1000);


async function createDOTestClusters() {
    // Skip kube cluster setup
    if(! KUBE_ENABLED) {
        logger.info(`Skipping kube cluster creation because KUBE_ENABLED is false`);
        return;
    }

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
            'image.tag' : { value: bctlQuickstartVersion, type: 'single'},
            'serviceUrl': { value: stripTrailingSlash(configService.serviceUrl()), type: 'single' },
            'image.agentTag': { value: bzeroAgentVersion, type: 'single'},
            'apiKey': { value: systemTestRESTApiKey.secret, type: 'single' },
            'clusterName': { value: cluster.name, type: 'single' },
            'users': { value: [configService.me().email], type: 'multi' },
            'targetUsers': { value: [KubeTestUserName], type: 'multi' },
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

function getPackageManagerRegistrationScript(packageName: string, testTarget: SSMTestTargetSelfRegistrationAutoDiscovery | VTTestTarget, envId: string, registrationApiKeySecret: string): string {
    let installBlock : string;
    const packageManager = getPackageManagerType(testTarget.dropletImage);
    // Install agent using the beta repo
    switch (packageManager) {
    case 'apt':
        installBlock = String.raw`sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E5C358E613982017
sudo apt update -y
sudo apt install -y software-properties-common
sudo add-apt-repository 'deb https://download-apt.bastionzero.com/beta/apt-repo stable main'
sudo apt update -y
sudo apt install ${packageName} -y
`;
        break;
    case 'yum':
        installBlock = String.raw`sudo yum-config-manager --add-repo https://download-yum.bastionzero.com/bastionzero-beta.repo
sudo yum update -y
sudo yum install ${packageName} -y
`;
        break;
    default:
        // Compile-time exhaustive check
        const _exhaustiveCheck: never = packageManager;
        return _exhaustiveCheck;
    }

    let registerCommand: string;
    let initBlock: string = '';
    switch(testTarget.installType) {
    case 'pm':
        registerCommand = `${packageName} --serviceUrl ${configService.serviceUrl()} -registrationKey "${registrationApiKeySecret}" -envID "${envId}"`;
        break;
    case 'pm-vt':
        registerCommand = `${packageName} --serviceUrl ${configService.serviceUrl()} -registrationKey "${registrationApiKeySecret}" -environmentId "${envId}"`;

        // Initialization for virtual targets
        // Common code start python server
        initBlock = String.raw`nohup python3 -m http.server > python-server.out 2> python-server.err < /dev/null &
`;

        switch (packageManager) {
        // Start python web server and postgres database
        case 'apt':
            initBlock += String.raw`sudo sed 's/peer/trust/' /etc/postgresql/12/main/pg_hba.conf -i
sudo sed 's/md5/trust/' /etc/postgresql/12/main/pg_hba.conf -i
sudo systemctl restart postgresql
`;
            break;
        case 'yum':
            initBlock += String.raw`sudo /usr/pgsql-12/bin/postgresql-12-setup initdb
sudo sed 's/peer/trust/' /var/lib/pgsql/12/data/pg_hba.conf -i
sudo sed 's/ident/trust/' /var/lib/pgsql/12/data/pg_hba.conf -i
sudo systemctl restart postgresql-12
`;
            break;
        default:
            // Compile-time exhaustive check
            const _exhaustiveCheck: never = packageManager;
            return _exhaustiveCheck;
        }

        break;
    default:
        // Compile-time exhaustive check
        const _exhaustiveCheck: never = testTarget;
        return _exhaustiveCheck;
    }

    return String.raw`#!/bin/bash
set -Ee
${installBlock}
${initBlock}
${registerCommand}
`;
}

async function createDOTestTargets() {
    // Create a droplet for various types of test targets
    const createDroplet = async (testTarget: TestTarget) => {
        const targetName = `st-${systemTestUniqueId}-${getDOImageName(testTarget.dropletImage)}-${testTarget.installType}-${randomAlphaNumericString(15)}`;

        // Get default env
        const environmentService = new EnvironmentHttpService(configService, logger);
        const environments = await environmentService.ListEnvironments();
        const defaultEnvironment = await getEnvironmentFromName('Default', environments, logger);
        const envId = defaultEnvironment.id;

        let autoDiscoveryScript : string;
        switch (testTarget.installType) {
        case 'ad':
            // Get the beta agent
            autoDiscoveryScript = await getAutodiscoveryScript(logger, configService, envId, ScriptTargetNameOption.DigitalOceanMetadata, 'staging');
            break;
        case 'pm':
            autoDiscoveryScript = getPackageManagerRegistrationScript('bzero-ssm-agent', testTarget, envId, systemTestRegistrationApiKey.secret);
            break;
        case 'pm-vt':
            autoDiscoveryScript = getPackageManagerRegistrationScript('bzero-beta', testTarget, envId, systemTestRegistrationApiKey.secret);
            break;
        default:
            // Compile-time exhaustive check
            const _exhaustiveCheck: never = testTarget;
            return _exhaustiveCheck;
        }

        const droplet = await doService.createDigitalOceanSSMTarget({
            targetName: targetName,
            dropletParameters: {
                dropletName: targetName,
                dropletSize: 's-1vcpu-1gb',
                dropletImage: testTarget.dropletImage,
                dropletRegion: testTarget.doRegion,
                dropletTags: ['system-tests'],
            }
        }, autoDiscoveryScript);

        // Add the digital ocean droplet to test targets mapping so that we can clean it up in afterAll
        if(testTarget.installType === 'pm' || testTarget.installType == 'ad') {
            const digitalOceanSsmTarget: DigitalOceanSSMTarget = { type: 'ssm', droplet: droplet, ssmTarget: undefined};
            testTargets.set(testTarget, digitalOceanSsmTarget);

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
                `Successfully created DigitalOceanTarget:
                \tAWS region: ${testTarget.awsRegion}
                \tDigitalOcean region: ${testTarget.doRegion}
                \tInstall Type: ${testTarget.installType}
                \tDroplet ID: ${digitalOceanSsmTarget.droplet.id}
                \tDroplet Image: ${getDOImageName(testTarget.dropletImage)}
                \tSSM Target ID: ${digitalOceanSsmTarget.ssmTarget.id}`
            );

        } else if(testTarget.installType === 'pm-vt') {
            const digitalOceanBZeroTarget: DigitalOceanBZeroTarget = {  type: 'bzero', droplet: droplet, bzeroTarget: undefined};
            testTargets.set(testTarget, digitalOceanBZeroTarget);

            try {
                const bzeroTarget = await doService.pollBZeroTargetOnline(targetName);

                // Set the bzeroTarget associated with this digital ocean droplet
                digitalOceanBZeroTarget.bzeroTarget = bzeroTarget;
            } catch (err) {
                // Catch special exception so that we can save ssmTarget reference
                // for cleanup.
                //
                // SsmTargetStatusPollError is thrown if target reaches 'Error'
                // state, or if target is known but does not come online within the
                // specified timeout.
                if (err instanceof BzeroTargetStatusPollError) {
                    digitalOceanBZeroTarget.bzeroTarget = err.bzeroTarget;
                }

                // Still throw the error because something failed. No other system
                // tests should continue if one target fails to become Online.
                throw err;
            }

            console.log(
                `Successfully created DigitalOceanSSMTarget:
                \tAWS region: ${testTarget.awsRegion}
                \tDigitalOcean region: ${testTarget.doRegion}
                \tInstall Type: ${testTarget.installType}
                \tDroplet ID: ${digitalOceanBZeroTarget.droplet.id}
                \tDroplet Name: ${digitalOceanBZeroTarget.droplet.name}
                \tDroplet Image: ${getDOImageName(testTarget.dropletImage)}
                \tBZero Target ID: ${digitalOceanBZeroTarget.bzeroTarget.id}`
            );
        }
    };

    // Issue create droplet requests concurrently
    const allDropletCreationResults = Promise.allSettled(allTargets.map(img => createDroplet(img)));
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
        return doService.deleteDigitalOceanTarget(doTarget);
    }));

    await checkAllSettledPromise(allTargetsCleanup);
}

function initRegionalSSMTargetsTestConfig() {
    const enabledExtraRegionsEnvVar = process.env.EXTRA_REGIONS;
    const enabledExtraRegions = [];

    if (enabledExtraRegionsEnvVar === undefined) {
        // If not set, add Tokyo as a default extra region
        enabledExtraRegions.push('ap-northeast-1');
    } else {
        const enabledExtraRegionsEnvVarSplitAwsRegions = enabledExtraRegionsEnvVar.split(',').filter(r => r != '');
        enabledExtraRegions.push(...enabledExtraRegionsEnvVarSplitAwsRegions);
    }

    enabledExtraRegions.forEach(awsRegion =>
        ssmTestTargetsToRun.push(
            {
                installType: 'ad',
                dropletImage: DigitalOceanDistroImage.Debian11,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion
            },
            {
                installType: 'pm',
                dropletImage: DigitalOceanDistroImage.Debian11,
                doRegion: convertAwsRegionToDigitalOceanRegion(awsRegion),
                awsRegion: awsRegion
            }
        )
    );
}

async function setupSystemTestApiKeys() {
    const restApiKeyName = `system-test-${systemTestUniqueId}-api-key`;
    systemTestRESTApiKey = await apiKeyService.CreateNewApiKey({ name: restApiKeyName, isRegistrationKey: false });
    logger.info('Created REST api key ' + systemTestRESTApiKey.apiKeyDetails.id);

    const registrationKeyName = `system-test-${systemTestUniqueId}-registration-key`;
    systemTestRegistrationApiKey = await apiKeyService.CreateNewApiKey({ name: registrationKeyName, isRegistrationKey: true });
    logger.info('Created registration api key ' + systemTestRegistrationApiKey.apiKeyDetails.id);
}

async function cleanupSystemTestApiKeys() {
    await apiKeyService.DeleteApiKey(systemTestRESTApiKey.apiKeyDetails.id);
    await apiKeyService.DeleteApiKey(systemTestRegistrationApiKey.apiKeyDetails.id);
}

// Call various test suites
if(SSM_ENABLED) {
    versionSuite();
    listTargetsSuite();
    connectSuite();
}

if(KUBE_ENABLED) {
    kubeSuite();
}

if(VT_ENABLED) {
    vtSuite();
}