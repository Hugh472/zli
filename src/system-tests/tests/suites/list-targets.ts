import { testTargets } from '../system-test';
import * as ListTargetsService from '../../../services/list-targets/list-targets.service';
import { getMockResultValue } from '../utils/jest-utils';
import { TargetSummary } from '../../../services/common.types';
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

            const expectedSSMTargetSummaries = Array.from(testTargets.values()).map<TargetSummary>(t => ({
                type: TargetType.SsmTarget,
                id: t.ssmTarget.id,
                name: t.ssmTarget.name,
                environmentId: t.ssmTarget.environmentId,
                agentVersion: t.ssmTarget.agentVersion,
                agentId: t.ssmTarget.agentId,
                status: t.ssmTarget.status,
                targetUsers: expect.anything()
            }));

            for (const target of expectedSSMTargetSummaries) {
                const foundObject = returnedTargetSummaries.find(t => t.id === target.id);

                if (foundObject) {
                    expect(target).toMatchObject(foundObject);
                } else {
                    throw new Error(`Failed to find target with id:${target.id}`);
                }
            }
        });
    });
};