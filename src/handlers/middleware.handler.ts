import { Logger } from '../services/logger/logger.service';
import { ConfigService } from '../services/config/config.service';
import { version } from '../../package.json';
import { oauthMiddleware } from '../middlewares/oauth-middleware';
import { LoggerConfigService } from '../services/logger/logger-config.service';
import { KeySplittingService } from '../../webshell-common-ts/keysplitting.service/keysplitting.service';
import { TargetSummary } from '../services/common.types';
import { MixpanelService } from '../services/mixpanel/mixpanel.service';
import { TargetType } from '../../webshell-common-ts/http/v2/target/types/target.types';
import { DynamicAccessConfigHttpService } from '../http-services/targets/dynamic-access/dynamic-access-config.http-services';
import { EnvironmentHttpService } from '../http-services/environment/environment.http-services';
import { EnvironmentSummary } from '../../webshell-common-ts/http/v2/environment/types/environment-summary.responses';
import { KubeHttpService } from '../http-services/targets/kube/kube.http-services';
import { KubeClusterSummary } from '../../webshell-common-ts/http/v2/target/kube/types/kube-cluster-summary.types';
import { SsmTargetHttpService } from '../http-services/targets/ssm/ssm-target.http-services';


export function fetchDataMiddleware(configService: ConfigService, logger: Logger) {
    // Greedy fetch of some data that we use frequently
    const ssmTargetHttpService = new SsmTargetHttpService(configService, logger);
    const kubeHttpService = new KubeHttpService(configService, logger);
    const dynamicConfigHttpService = new DynamicAccessConfigHttpService(configService, logger);
    const envHttpService = new EnvironmentHttpService(configService, logger);

    const dynamicConfigs = new Promise<TargetSummary[]>( async (res) => {
        try
        {
            const response = await dynamicConfigHttpService.ListDynamicAccessConfigs();
            const results = response.map<TargetSummary>((config, _index, _array) => {
                return {type: TargetType.DynamicAccessConfig, id: config.id, name: config.name, environmentId: config.environmentId, agentVersion: 'N/A', status: undefined, targetUsers: undefined};
            });

            res(results);
        } catch (e: any) {
            logger.error(`Failed to fetch dynamic access configs: ${e}`);
            res([]);
        }
    });

    // We will to show existing dynamic access targets for file transfer
    // UX to be more pleasant as people cannot file transfer to configs
    // only the DATs they produce from the config
    const ssmTargets = new Promise<TargetSummary[]>( async (res) => {
        try
        {
            const response = await ssmTargetHttpService.ListSsmTargets(true);
            const results = response.map<TargetSummary>((ssm, _index, _array) => {
                return {type: TargetType.SsmTarget, id: ssm.id, name: ssm.name, environmentId: ssm.environmentId, agentVersion: ssm.agentVersion, status: ssm.status, targetUsers: undefined};
            });

            res(results);
        } catch (e: any) {
            logger.error(`Failed to fetch ssm targets: ${e}`);
            res([]);
        }
    });


    const clusterTargets = new Promise<KubeClusterSummary[]>( async (res) => {
        try {
            const response = await kubeHttpService.ListKubeClusters();
            const results = response.map<KubeClusterSummary>((cluster, _index, _array) => {
                return { id: cluster.id, clusterName: cluster.clusterName, status: cluster.status, environmentId: cluster.environmentId, validUsers: cluster.validUsers, agentVersion: cluster.agentVersion, lastAgentUpdate: cluster.lastAgentUpdate };
            });

            res(results);
        } catch (e: any) {
            logger.error(`Failed to fetch cluster targets: ${e}`);
            res([]);
        }
    });


    const envs = new Promise<EnvironmentSummary[]>( async (res) => {
        try {
            const response = await envHttpService.ListEnvironments();
            res(response);
        } catch (e: any) {
            logger.error(`Failed to fetch environments: ${e}`);
            res([]);
        }
    });

    return {
        dynamicConfigs: dynamicConfigs,
        ssmTargets: ssmTargets,
        clusterTargets: clusterTargets,
        envs: envs
    };
}

export function mixpanelTrackingMiddleware(configService: ConfigService, argv: any) {
    // Mixpanel tracking
    const mixpanelService = new MixpanelService(configService);

    // Only captures args, not options at the moment. Capturing configName flag
    // does not matter as that is handled by which mixpanel token is used
    // TODO: capture options and flags
    mixpanelService.TrackCliCommand(version, argv._[0], argv._.slice(1));

    return mixpanelService;
}

export async function oAuthMiddleware(configService: ConfigService, logger: Logger) {
    // OAuth
    await oauthMiddleware(configService, logger);
    const me = configService.me(); // if you have logged in, this should be set
    const sessionId = configService.sessionId();
    logger.info(`Logged in as: ${me.email}, bzero-id:${me.id}, session-id:${sessionId}`);
}

export function initLoggerMiddleware(argv: any) {
    // Configure our logger
    const loggerConfigService = new LoggerConfigService(<string> argv.configName, argv.configDir);

    const logger = new Logger(loggerConfigService, !!argv.debug, !!argv.silent, !!process.stdout.isTTY);

    // isTTY detects whether the process is being run with a text terminal
    // ("TTY") attached. This way we detect whether we should connect
    // logger.error to stderr in order to be able to print error messages to the
    // user (e.g. ssh-proxy mode)
    return {
        logger: logger,
        loggerConfigService: loggerConfigService
    };
}

export async function initMiddleware(argv: any, logger : Logger) {
    // Config init
    const configService = new ConfigService(<string>argv.configName, logger, argv.configDir);

    // KeySplittingService init
    const keySplittingService = new KeySplittingService(configService, logger);
    await keySplittingService.init();

    return {
        configService: configService,
        keySplittingService: keySplittingService
    };
}