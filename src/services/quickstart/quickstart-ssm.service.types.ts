// Interface types for SSHConfig parsing package
export interface SSHHostConfig {
    param: string;
    value: string;
}
export interface SSHConfigHostBlock {
    param: string;
    value: string;
    config: SSHHostConfig[]
}

// SSHHost encapsulates the information needed to start an SSH connection
export interface SSHHost {
    name: string;
    hostIp: string;
    port: number;
    username: string;
    identityFile: string;
}