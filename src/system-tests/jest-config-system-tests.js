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
    },
    reporters: [
        "default",
        ["jest-2-testrail", { project_id: "2", suite_id: "1" }]
    ]
}