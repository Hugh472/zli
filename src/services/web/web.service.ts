export interface WebConfig {
    name: string, 
    localHost: string,
    localPort: number,
    localPid: null
}

export function getDefaultWebConfig(): WebConfig {
    return {
        localHost: null,
        localPort: null,
        localPid: null,
        name: null,
    };
}