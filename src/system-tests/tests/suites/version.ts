import { callZli } from '../system-test';
import { version } from '../../../../package.json';

export const versionSuite = () => {
    describe('version suite', () => {
        test('version', async () => {
            await callZli(['--version'], async (_err, _argv, output) => {
                expect(output).toBe(version);
            });
        });
    });
};