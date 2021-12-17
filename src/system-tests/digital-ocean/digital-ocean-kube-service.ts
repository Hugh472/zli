import { Retrier } from '@jsier/retrier';
import { DigitalOcean } from 'digitalocean-js';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { KubeService } from '../../services/v1/kube/kube.service';
import { KubernetesCluster, KubernetesWorkerNodePool } from 'digitalocean-js/build/main/lib/models/kubernetes-cluster';
import { ClusterTargetStatusPollError, CreateNewKubeClusterParameters, RegisteredDigitalOceanKubernetesCluster } from './digital-ocean-kube.service.types';
import { ClusterSummary, KubeClusterStatus } from '../../services/v1/kube/kube.types';
import { checkAllSettledPromise } from '../tests/utils/utils';
import { PolicyService } from '../../services/v1/policy/policy.service';
import { EnvironmentHttpService } from 'http-services/environment/environment.http-services';
import { KubeHttpService } from 'http-services/targets/kube/kube.http-services';
import { KubeClusterSummary } from 'http/v2/target/kube/types/kube-cluster-summary.types';
import { AgentStatus } from 'http/v2/target/kube/types/agent-status.types';

export class DigitalOceanKubeService {
    private doClient: DigitalOcean;
    private kubeHttpService: KubeHttpService;
    private policyService: PolicyService;
    private envHttpService: EnvironmentHttpService;

    constructor(
        apiToken: string,
        private configService: ConfigService,
        private logger: Logger
    ) {
        this.doClient = new DigitalOcean(apiToken);
        this.kubeHttpService = new KubeHttpService(this.configService, this.logger);
        this.policyService = new PolicyService(this.configService, this.logger);
        this.envHttpService = new EnvironmentHttpService(this.configService, this.logger);
    }

    /**
     * Create a DigitalOcean cluster.
     * @returns Information about the created cluster
     */
    public async createDigitalOceanKubeCluster(parameters: CreateNewKubeClusterParameters): Promise<KubernetesCluster> {
        // Try 3 times with a delay of 10 seconds between each attempt.
        const retrier = new Retrier({
            limit: 3,
            delay: 1000 * 10
        });

        const cluster: KubernetesCluster = await retrier.resolve((attempt) => {
            this.logger.info(`Attempt ${attempt} creating kube cluster ${parameters.clusterName}`);
            return this.createNewCluster(parameters);
        });

        return cluster;
    }

    /**
     * Get the kubeconfig file for a DigitalOcean Kubernetes cluster
     * @param cluster The DigitalOcean cluster
     * @returns String that should be stored in a kubeconfig file
     */
    public async getClusterKubeConfig(cluster: KubernetesCluster): Promise<string> {
        // Try 3 times with a delay of 10 seconds between each attempt.
        const retrier = new Retrier({
            limit: 3,
            delay: 1000 * 10
        });

        const kubeConfig: string = await retrier.resolve((attempt) => {
            this.logger.info(`Attempt ${attempt} getting kube config for cluster ${cluster.name}`);
            return this.doClient.kubernetes.getClusterKubeconfig(cluster.id);
        });

        return kubeConfig;
    }

    /**
     * Cleans up a DigitalOcean cluster by deleting the cluster on BastionZero
     * and DigitalOcean
     * @param registeredCluster The registered DigitalOcean cluster to clean up
     * @returns A promise that represents the results of deleting the cluster on
     * DigitalOcean and BastionZero concurrently
     */
    public async deleteRegisteredKubernetesCluster(
        registeredCluster: RegisteredDigitalOceanKubernetesCluster
    ): Promise<void> {

        const cleanupPromises = [];

        // Only delete cluster on DigitalOcean if it is set
        if (registeredCluster.doClusterSummary) {
            // Try 3 times with a delay of 10 seconds between each attempt.
            const retrier = new Retrier({
                limit: 3,
                delay: 1000 * 10
            });

            const deleteDOClusterPromise: Promise<void> = retrier.resolve((attempt) => {
                this.logger.info(`Attempt ${attempt} deleting cluster ${registeredCluster.doClusterSummary.name}`);
                return this.doClient.kubernetes.deleteCluster(registeredCluster.doClusterSummary.id);
            });

            cleanupPromises.push(deleteDOClusterPromise);
        }


        // NOTE: If cluster delete call fails, then there will also be an
        // extraneous env
        cleanupPromises.push(this.deleteKubeClusterTargetAndEnv(registeredCluster));

        // Always attempt to delete the policy for this cluster. It is possible
        // for the policy not to exist (e.g. something broke in helm).
        cleanupPromises.push(this.deleteClusterPolicy(registeredCluster));

        await checkAllSettledPromise(Promise.allSettled(cleanupPromises));
    }

    private async deleteKubeClusterTargetAndEnv(registeredCluster: RegisteredDigitalOceanKubernetesCluster): Promise<void> {

        // Only delete cluster target on BastionZero if it is set.
        // Delete env as well but only after deleting cluster
        if (registeredCluster.bzeroClusterTargetSummary) {
            await this.kubeHttpService.DeleteKubeCluster(registeredCluster.bzeroClusterTargetSummary.id);
        }

        // We cannot delete the env until the target has been deleted as this is
        // a hard requirement in the backend.
        await this.deleteClusterEnv(registeredCluster);
    }

    private async deleteClusterPolicy(registeredCluster: RegisteredDigitalOceanKubernetesCluster): Promise<void> {
        // Find the policy that Helm creates and delete it
        const policyName = this.getHelmClusterPolicyName(registeredCluster.doClusterSummary.name);
        const policies = await this.policyService.ListAllPolicies();
        const kubePolicy = policies.find(p => p.name === policyName);
        if (kubePolicy) {
            await this.policyService.DeletePolicy(kubePolicy.id);
        } else {
            throw new Error(`Unexpected error! Expected to find at least one policy with name: ${policyName}`);
        }
    }

    private async deleteClusterEnv(registeredCluster: RegisteredDigitalOceanKubernetesCluster): Promise<void> {
        // Find the env that Helm creates and delete it
        const envName = this.getHelmClusterEnvName(registeredCluster.doClusterSummary.name);
        const envs = await this.envHttpService.ListEnvironments();
        const kubeEnv = envs.find(e => e.name === envName);
        if (kubeEnv) {
            await this.envHttpService.DeleteEnvironment(kubeEnv.id);
        } else {
            throw new Error(`Unexpected error! Expected to find at least one env with name: ${envName}`);
        }
    }

    /**
     * Polls the bastion until the Cluster target is Online.
     * @param clusterTargetName The name of the cluster target to poll
     * @returns Information about the cluster
     */
    public async pollClusterTargetOnline(clusterTargetName: string): Promise<KubeClusterSummary> {
        // Try 30 times with a delay of 10 seconds between each attempt.
        const retrier = new Retrier({
            limit: 30,
            delay: 1000 * 10,
            stopRetryingIf: (reason: any) => reason instanceof ClusterTargetStatusPollError && reason.clusterSummary.status === AgentStatus.Error
        });

        // We don't know Cluster target ID initially
        let clusterTargetId: string = '';
        return retrier.resolve(() => new Promise<KubeClusterSummary>(async (resolve, reject) => {
            const checkIsClusterTargetOnline = (clusterSummary: KubeClusterSummary) => {
                if (clusterSummary.status === AgentStatus.Online) {
                    resolve(clusterSummary);
                } else {
                    throw new ClusterTargetStatusPollError(clusterSummary, `Cluster target ${clusterSummary.clusterName} is not online. Has status: ${clusterSummary.status}`);
                }
            };
            try {
                if (clusterTargetId === '') {
                    // We don't know the cluster target ID yet, so we have to
                    // use the less efficient list API to learn about the ID
                    const clusters = await this.kubeHttpService.ListKubeClusters();
                    const foundTarget = clusters.find(target => target.clusterName === clusterTargetName);
                    if (foundTarget) {
                        clusterTargetId = foundTarget.id;
                        checkIsClusterTargetOnline(foundTarget);
                    } else {
                        throw new Error(`Cluster target with name ${clusterTargetName} does not exist`);
                    }
                } else {
                    // Cluster target ID is known
                    const target = await this.kubeHttpService.GetKubeCluster(clusterTargetId);
                    checkIsClusterTargetOnline(target);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Polls DigitalOcean's GET Kubernetes cluster API until it says the
     * provided cluster has status == "running".
     * @param cluster Cluster to query
     * @returns Cluster information after its status == "running"
     */
    public async pollClusterRunning(cluster: KubernetesCluster): Promise<KubernetesCluster> {
        // Try 90 times with a delay of 10 seconds between each attempt (total 15 min).
        // Average ETA: 5-10 minutes to provision
        const retrier = new Retrier({
            limit: 90,
            delay: 1000 * 10
        });

        return retrier.resolve(() => new Promise<KubernetesCluster>(async (resolve, reject) => {
            try {
                // A status string indicating the state of the cluster instance.
                // This may be: "running", "provisioning", "degraded" "error",
                // "deleted", "upgrading" or "deleting". Source:
                // https://docs.digitalocean.com/reference/api/api-reference/#operation/get_kubernetes_cluster
                const retrievedCluster = await this.doClient.kubernetes.getCluster(cluster.id);
                if (retrievedCluster.status.state === 'running') {
                    resolve(retrievedCluster);
                } else {
                    throw new Error(`Cluster is not running. Has status: ${retrievedCluster.status.state}`);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Create a new Kubernetes cluster
     * @param parameters Parameters to use when creating the cluster
     * @returns Information about the newly created cluster
     */
    private async createNewCluster(
        parameters: CreateNewKubeClusterParameters
    ): Promise<KubernetesCluster> {
        const request = {
            name: parameters.clusterName,
            region: parameters.clusterRegion,
            version: parameters.clusterVersion,
            tags: parameters.clusterTags,
            node_pools: parameters.clusterNodePools.map<KubernetesWorkerNodePool>(w => {
                const apiWorkerNodePool: KubernetesWorkerNodePool = {
                    size: w.workerDropletSize,
                    name: w.nodePoolName,
                    count: w.dropletInstancesCount,
                    tags: w.workerNodeTags,
                };

                if (w.autoScaleParameters) {
                    apiWorkerNodePool.auto_scale = true;
                    apiWorkerNodePool.min_nodes = (w.autoScaleParameters.minNodes ? w.autoScaleParameters.minNodes : 1) as any;
                    apiWorkerNodePool.max_nodes = w.autoScaleParameters.maxNodes as any;
                }

                return apiWorkerNodePool;
            }) as any
        };
        return this.doClient.kubernetes.createCluster(request);
    }

    /**
     * Returns the environment name created by helm for a new cluster
     * @param clusterName
     * @returns The environment name
     */
    private getHelmClusterEnvName(clusterName: string): string {
        return `${clusterName}-Env`;
    }

    /**
     * Returns the policy name created by helm for a new cluster
     * @param clusterName
     * @returns The policy name
     */
    private getHelmClusterPolicyName(clusterName: string): string {
        return `${clusterName}-policy`;
    }
}
