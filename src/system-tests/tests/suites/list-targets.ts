import { testTargets } from '../system-test';
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

        test('list-targets', async () => {
            const listTargetsSpy = jest.spyOn(ListTargetsService, 'listTargets');
            await callZli(['list-targets', '--json']);

            expect(listTargetsSpy).toHaveBeenCalledTimes(1);
            const returnedTargetSummaries = (await getMockResultValue(listTargetsSpy.mock.results[0]));

            const expectedSSMTargetSummaries = Array.from(testTargets.values()).map<TargetSummary>(t => {
                if(t.type === 'ssm') {
                    return {
                        type: TargetType.SsmTarget,
                        id: t.ssmTarget.id,
                        name: t.ssmTarget.name,
                        environmentId: t.ssmTarget.environmentId,
                        agentVersion: t.ssmTarget.agentVersion,
                        status: t.ssmTarget.status,
                        targetUsers: expect.anything(),
                        region: t.ssmTarget.region
                    };
                } else if(t.type === 'bzero') {
                    return {
                        type: TargetType.Bzero,
                        id: t.bzeroTarget.id,
                        name: t.bzeroTarget.name,
                        environmentId: t.bzeroTarget.environmentId,
                        agentVersion: t.bzeroTarget.agentVersion,
                        status: t.bzeroTarget.status,
                        targetUsers: expect.anything(),
                        region: t.bzeroTarget.region
                    };
                }
            });

            for (const target of expectedSSMTargetSummaries) {
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