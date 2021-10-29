export type KeyPressMetricState = {
    testStarted: boolean;
    sequenceNumber: number;
    waitingForInput: boolean;
    lastInputReceivedNS?: bigint;
    lastInputReceivedUnixMS?: number;
}

export type KeyPressMetricEvent = {
    sequenceNumber: number;
    startTimeUnixMs: number; 
    endTimeUnixMs: number;
    deltaMS: number;
    deltaNS: bigint;
}
