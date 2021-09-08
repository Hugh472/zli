import SSHConfig from "ssh2-promise/lib/sshConfig"

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
export interface ValidSSHHost {
    name: string;
    hostIp: string;
    port: number;
    username: string;
    identityFile: string;
}

export interface ValidSSHConfig {
    config: SSHConfig;
    sshHostName: string;
}

type SSHConfigParseErrorType = "missing_host_name" | "missing_port" | "missing_user" | "missing_identity_file"

export type SSHConfigParseErrorBase = {
    error: SSHConfigParseErrorType;
}

export interface MissingHostNameParseError extends SSHConfigParseErrorBase {
    error: "missing_host_name"
};

export interface MissingPortParseError extends SSHConfigParseErrorBase {
    error: "missing_port"
}

export interface MissingUserParseError extends SSHConfigParseErrorBase {
    error: "missing_user"
}

export interface MissingIdentityFileParseError extends SSHConfigParseErrorBase {
    error: "missing_identity_file"
}

export type SSHConfigParseError =
    | MissingHostNameParseError
    | MissingPortParseError
    | MissingUserParseError
    | MissingIdentityFileParseError

export interface InvalidSSHHost {
    name: string;
    parseErrors: SSHConfigParseError[]
}