export interface WebConfig {
    localHost: string,
    localPort: number,
}

export function getDefaultWebConfig(): WebConfig {
    return {
        localHost: null,
        localPort: null,
    };
}