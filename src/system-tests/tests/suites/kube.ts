import * as k8s from '@kubernetes/client-node';
import { callZli } from '../utils/zli-utils';
import { HttpError } from '@kubernetes/client-node';
import { clusterVersionsToRun, testClusters } from '../system-test';

export const kubeSuite = () => {
    describe('kube suite', () => {
        beforeEach(() => {
            jest.restoreAllMocks();
            jest.clearAllMocks();
        });

        afterEach(async () => {
            // Always disconnect
            await callZli(['disconnect']);
        });

        test.each(clusterVersionsToRun)('zli tunnel - Kube REST API plugin - get namespaces - %p', async (clusterVersion) => {
            const doCluster = testClusters.get(clusterVersion);

            const kubeConfigYamlFilePath = '/tmp/bzero-agent-kubeconfig.yml';

            // Generate the kubeConfig YAML and write to a file to be read by
            // the kubectl ts library
            await callZli(['generate', 'kubeConfig', '-o', kubeConfigYamlFilePath]);

            // Init Kube client
            const kc = new k8s.KubeConfig();
            kc.loadFromFile(kubeConfigYamlFilePath);
            const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

            // Start tunnel
            await callZli(['tunnel', `foo@${doCluster.bzeroClusterTargetSummary.clusterName}`, '--targetGroup', 'system:masters']);

            // Attempt to list namespaces using agent
            try {
                const listNamespaceResp = await k8sApi.listNamespace();
                const resp = listNamespaceResp.body;

                // Assert that bastionzero namespace (created by helm quickstart) exists
                expect(resp.items.find(t => t.metadata.name === 'bastionzero')).toBeTruthy();
            } catch (err) {
                // Pretty print Kube API error
                if (err instanceof HttpError) {
                    console.log(`Kube API returned error: ${JSON.stringify(err.response, null, 4)}`);
                }
                throw err;
            }
        }, 30 * 1000);
    });
};