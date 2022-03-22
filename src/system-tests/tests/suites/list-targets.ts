import { systemTestEnvId, testClusters, testTargets } from '../system-test';
import * as ListTargetsService from '../../../services/list-targets/list-targets.service';
import { getMockResultValue } from '../utils/jest-utils';
import { TargetSummary } from '../../../../webshell-common-ts/http/v2/target/targetSummary.types';
import { callZli } from '../utils/zli-utils';
import { TargetType } from '../../../../webshell-common-ts/http/v2/target/types/target.types';

export const listTargetsSuite = () => {
    describe('list targets suite', () => {
        beforeEach(() => {
            jest.restoreAllMocks();
            jest.clearAllMocks();
        });

        test('2117: list-targets', async () => {
            const listTargetsSpy = jest.spyOn(ListTargetsService, 'listTargets');
            await callZli(['list-targets', '--json']);

            expect(listTargetsSpy).toHaveBeenCalledTimes(1);
            const returnedTargetSummaries = (await getMockResultValue(listTargetsSpy.mock.results[0]));

            const expectedSSMTargetSummaries = Array.from(testTargets.values()).map<TargetSummary>(t => {
                if(t.type === 'ssm') {
                    return {
                        type: TargetType.SsmTarget,
                        agentPublicKey: t.ssmTarget.agentPublicKey,
                        id: t.ssmTarget.id,
                        name: t.ssmTarget.name,
                        environmentId: systemTestEnvId,
                        agentVersion: t.ssmTarget.agentVersion,
                        status: t.ssmTarget.status,
                        targetUsers: t.ssmTarget.allowedTargetUsers.map(tu => tu.userName),
                        region: t.ssmTarget.region
                    };
                } else if(t.type === 'bzero') {
                    return {
                        type: TargetType.Bzero,
                        agentPublicKey: t.bzeroTarget.agentPublicKey,
                        id: t.bzeroTarget.id,
                        name: t.bzeroTarget.name,
                        environmentId: systemTestEnvId,
                        agentVersion: t.bzeroTarget.agentVersion,
                        status: t.bzeroTarget.status,
                        targetUsers: expect.anything(),
                        region: t.bzeroTarget.region
                    };
                }
            });

            const expectedClusterSummaries = Array.from(testClusters.values()).map<TargetSummary>(cluster => {
                return {
                    type: TargetType.Cluster,
                    agentPublicKey:  cluster.bzeroClusterTargetSummary.agentPublicKey,
                    id: cluster.bzeroClusterTargetSummary.id,
                    name: cluster.bzeroClusterTargetSummary.name,
                    environmentId: cluster.bzeroClusterTargetSummary.environmentId,
                    agentVersion: cluster.bzeroClusterTargetSummary.agentVersion,
                    status: cluster.bzeroClusterTargetSummary.status,
                    targetUsers: cluster.bzeroClusterTargetSummary.allowedClusterUsers,
                    region: cluster.bzeroClusterTargetSummary.region
                };
            });

            for (const target of [...expectedClusterSummaries, ...expectedSSMTargetSummaries]) {
                const foundObject = returnedTargetSummaries.find(t => t.id === target.id);

                if (foundObject) {
                    expect(target).toMatchObject(foundObject);
                } else {
                    throw new Error(`Failed to find target with id:${target.id}`);
                }
            }
        }, 30 * 1000);
    });
};