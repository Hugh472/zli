import { version } from '../../../../package.json';
import { callZli } from '../utils/zli-utils';

export const versionSuite = () => {
    describe('version suite', () => {
        test('2125: version', async () => {
            await callZli(['--version'], async (_err, _argv, output) => {
                expect(output).toBe(version);
            });
        });
    });
};