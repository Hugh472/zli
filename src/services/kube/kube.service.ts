import os from 'os';
import { ConfigService } from '../config/config.service';
import { HttpService } from '../http/http.service';
import { Logger } from '../logger/logger.service';
import { GetKubeUnregisteredAgentYamlResponse, GetKubeUnregisteredAgentYamlRequest, GetUserInfoResponse, GetUserInfoRequest } from './kube.mesagges';
import { ClusterSummary } from './kube.types';

const exec = require('child_process').execSync;

export interface KubeConfig {
    keyPath: string,
    certPath: string,
    token: string,
    localHost: string,
    localPort: number,
    localPid: number,
    targetUser: string,
    targetGroups: string[],
    targetCluster: string,
    defaultTargetGroups: string[]
}

export class KubeService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v1/kube', logger);
    }

    public getKubeUnregisteredAgentYaml(
        clusterName: string,
        labels: { [index: string ]: string },
        namespace: string,
        environmentId: string,
    ): Promise<GetKubeUnregisteredAgentYamlResponse>
    {
        const request: GetKubeUnregisteredAgentYamlRequest = {
            clusterName: clusterName,
            labels: labels,
            namespace: namespace,
            environmentId: environmentId,
        };
        return this.Post('get-agent-yaml', request);
    }

    public GetUserInfoFromEmail(
        email: string
    ): Promise<GetUserInfoResponse>
    {
        const request: GetUserInfoRequest = {
            email: email,
        };

        return this.Post('get-user', request);
    }

    public ListKubeClusters(): Promise<ClusterSummary[]> {
        return this.Get('list', {});
    }
}

export async function killDaemon(configService: ConfigService, logger: Logger) {
    const kubeConfig = configService.getKubeConfig();

    // then kill the daemon
    if ( kubeConfig['localPid'] != null) {
        // First try to kill the process
        try {
            if (process.platform === 'win32') {
                exec(`taskkill /F /T /PID ${kubeConfig['localPid'].toString()}`);
            } else if (process.platform === 'linux') {
                exec(`pkill -s ${kubeConfig['localPid'].toString()}`);
            } else {
                // Determine if we are on a m1 mac
                // Ref: https://stackoverflow.com/questions/65146751/detecting-apple-silicon-mac-in-javascript
                const osCpus = os.cpus();
                if (osCpus.length < 1) {
                    throw new Error(`Unable to determine OS CPU type. Please manually kill the daemon PID: ${kubeConfig['localPid'].toString()}`);
                }

                const isM1 = osCpus[0].model.includes('Apple M1');
                if (isM1) {
                    exec(`pkill -TERM -P ${kubeConfig['localPid'].toString()}`);
                } else {
                    exec(`kill -9 ${kubeConfig['localPid'].toString()}`);
                }
            }
        } catch (err: any) {
            // If the daemon pid was killed, or doesn't exist, just continue
            logger.warn(`Attempt to kill existing daemon failed. This is expected if the daemon has been killed already. Make sure no program is using port: ${kubeConfig['localPort']}.\nError: ${err}`);
        }

        // Update the config
        kubeConfig['localPid'] = null;
        configService.setKubeConfig(kubeConfig);

        return true;
    } else {
        return false;
    }
}

export function getDefaultKubeConfig(): KubeConfig {
    return {
        keyPath: null,
        certPath: null,
        token: null,
        localHost: null,
        localPort: null,
        localPid: null,
        targetUser: null,
        targetGroups: null,
        targetCluster: null,
        defaultTargetGroups: null,
    };
}