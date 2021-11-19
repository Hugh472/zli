module.exports = {
    "roots": [
        "<rootDir>/tests"
    ],
    "testRegex": 'system-test.ts',
    "transform": {
        "^.+\\.(ts|tsx)$": "ts-jest"
    },
    globals: {
        Uint8Array: Uint8Array,
    }
}