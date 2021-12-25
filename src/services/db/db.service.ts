export interface DbConfig {
    localHost: string,
    localPort: number,
}

export function getDefaultDbConfig(): DbConfig {
    return {
        localHost: null,
        localPort: null,
    };
}