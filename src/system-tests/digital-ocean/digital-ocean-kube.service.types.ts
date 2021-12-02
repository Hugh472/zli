import { KubernetesCluster } from 'digitalocean-js/build/main/lib/models/kubernetes-cluster';
import { ClusterSummary } from '../../services/kube/kube.types';
import { DigitalOceanDropletSize, DigitalOceanRegion } from './digital-ocean.types';

/**
 * Represents a DigitalOcean Kubernetes cluster that has been registered with
 * BastionZero as a cluster target
 */
export type RegisteredDigitalOceanKubernetesCluster = {
    doClusterSummary: KubernetesCluster;
    bzeroClusterTargetSummary: ClusterSummary;
    kubeConfigFileContents: string;
};

/**
 * String union of DigitalOcean's offered Kubernetes versions
 * Source: https://slugs.do-api.dev/
 */
export const DigitalOceanKubernetesClusterVersion = {
    Version1_19_15: '1.19.15-do.0',
    Version1_20_11: '1.20.11-do.0',
    Version1_21_5: '1.21.5-do.0',
    // use the latest published version
    LatestVersion: 'latest'
} as const;
export type DigitalOceanKubernetesClusterVersion = typeof DigitalOceanKubernetesClusterVersion[keyof typeof DigitalOceanKubernetesClusterVersion];

/**
 * Parameters to create a new DigitalOcean Kubernetes cluster
 */
export type CreateNewKubeClusterParameters = {
    clusterName: string;
    clusterRegion: DigitalOceanRegion;
    clusterVersion: DigitalOceanKubernetesClusterVersion;
    clusterNodePools: WorkerNodePool[];
    clusterTags?: string[];
}

/**
 * Parameters to create a node pool. A node pool is a group of 1 or more
 * droplets of the same size
 */
export type WorkerNodePool = {
    workerDropletSize: DigitalOceanDropletSize;
    nodePoolName: string;
    dropletInstancesCount: number;
    workerNodeTags?: string[];
    autoScaleParameters?: AutoScaleParameters
}

/**
 * Parameters to configure autoscaling for a node pool
 */
export type AutoScaleParameters = {
    minNodes?: number,
    maxNodes: number
}

/**
 * This error is thrown when the cluster target status poller sees that the
 * watched target has entered the "Error" state, or if the poller times out
 * before the target can reach "Online"
 */
export class ClusterTargetStatusPollError extends Error {
    constructor(
        public clusterSummary: ClusterSummary,
        message?: string) {
        super(message);
        this.name = 'ClusterTargetStatusPollError';
    }
}