module.exports = {
    "roots": [
      "<rootDir>/src"
    ],
    "testMatch": [
      "**/?(*.)+(spec|test).+(ts|tsx|js)",
      "!**/system-tests/**"
    ],
    "transform": {
      "^.+\\.(ts|tsx)$": "ts-jest"
    },
    globals: {
      Uint8Array: Uint8Array,
    }
}