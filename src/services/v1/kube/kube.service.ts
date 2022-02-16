import { ConfigService } from '../../config/config.service';
import { HttpService } from '../../http/http.service';
import { Logger } from '../../logger/logger.service';
import { GetKubeUnregisteredAgentYamlResponse, GetKubeUnregisteredAgentYamlRequest, GetUserInfoResponse, GetUserInfoRequest, DeleteClusterRequest } from './kube.messages';
import { ClusterSummary } from './kube.types';

const exec = require('child_process').execSync;
const pids = require('port-pid');

export interface KubeConfig {
    keyPath: string,
    certPath: string,
    csrPath: string,
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
        name: string,
        labels: { [index: string ]: string },
        namespace: string,
        environmentId: string,
    ): Promise<GetKubeUnregisteredAgentYamlResponse>
    {
        const request: GetKubeUnregisteredAgentYamlRequest = {
            name: name,
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

    public GetKubeCluster(clusterTargetId: string): Promise<ClusterSummary> {
        return this.Get('', { id: clusterTargetId });
    }

    public DeleteKubeCluster(req: DeleteClusterRequest): Promise<void> {
        return this.Post('delete', req);
    }
}

export async function killDaemon(configService: ConfigService, logger: Logger) {
    const kubeConfig = configService.getKubeConfig();

    let toReturn = false;

    // then kill the daemon
    if ( kubeConfig['localPid'] != null) {
        // First try to kill the process
        try {
            killPid(kubeConfig['localPid'].toString());
        } catch (err: any) {
            // If the daemon pid was killed, or doesn't exist, just continue
            logger.warn(`Attempt to kill existing daemon failed. This is expected if the daemon has been killed already. Make sure no program is using port: ${kubeConfig['localPort']}.\nError: ${err}`);
        }
        // Update the config
        kubeConfig['localPid'] = null;
        configService.setKubeConfig(kubeConfig);

        toReturn = true;
    }
    // Always ensure nothing is using the localport
    await killPortProcess(kubeConfig['localPort']);

    return toReturn;
}

export async function killPortProcess(port: number) {
    // Helper function to kill a process running on a given port (if it exists)
    try {
        const portPids = await getPidForPort(port);

        // Loop over all pids and kill
        portPids.forEach( (portPid: number) => {
            killPid(portPid.toString());
        });
    } catch {
        // Don't try to capture any errors incase the process has already been killed
    }
}

async function getPidForPort(port: number): Promise<number[]> {
    // Helper function to get a pids from a port number
    const getPidPromise = new Promise<number[]>(async (resolve, _) => {
        pids(port).then((pids: any) => {
            resolve(pids.tcp);
        });
    });
    return await getPidPromise;
}

function killPid(pid: string) {
    // Helper function to kill a process for a given pid
    if (process.platform === 'win32') {
        exec(`taskkill /F /T /PID ${pid}`);
    } else if (process.platform === 'linux') {
        exec(`pkill -s ${pid}`);
    } else {
        exec(`kill -9 ${pid}`);
    }
}

export function getDefaultKubeConfig(): KubeConfig {
    return {
        keyPath: null,
        certPath: null,
        csrPath: null,
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
