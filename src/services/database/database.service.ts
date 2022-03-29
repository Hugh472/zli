export interface DbConfig {
    name: string,
    localHost: string,
    localPort: number,
    localPid: number,
}

export function getDefaultDbConfig(): DbConfig {
    return {
        name: null,
        localHost: null,
        localPort: null,
        localPid: null
    };
}