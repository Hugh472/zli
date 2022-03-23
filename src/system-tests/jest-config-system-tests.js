toExport = {
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
        "default"
    ]
};

if (process.env.BZERO_PROD == 'true') {
    toExport.reporters.push(["jest-2-testrail", { project_id: "2", suite_id: "1" }]);
};


module.exports = toExport;