export interface LatencyV1MetricsRequest {
    startTime: number;
    endTime: number;
    service: string;
    description: string;
    connectionId: string;
    sequenceNumber: number;
    deltaMs: number;
}