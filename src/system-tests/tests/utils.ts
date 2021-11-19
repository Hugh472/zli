export function getMockResultValue<T>(result: jest.MockResult<T>): T {
    if (result.type === 'return') {
        return result.value;
    } else {
        throw new Error(`Got unexpected MockResult type: ${result.type}`);
    }
};