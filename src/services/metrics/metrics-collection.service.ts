import { Logger } from "../logger/logger.service";
import { KeyPressMetricEvent, KeyPressMetricState } from "./metrics-collection.service.types";
import { LatencyV1MetricsRequest } from "./metrics-http.messages";
import { MetricsHttpService } from "./metrics-http.service";

/**
 * Create a new MetricsCollectionService per connection
 * TODO-metrics: Add error handling throughout this service!
 */
export class MetricsCollectionService {
    private metricState: KeyPressMetricState;

    constructor(
        private logger: Logger,
        private connectionId: string,
        private metricsHttpService: MetricsHttpService
    ) {
        // Init metric state
        this.metricState = {
            sequenceNumber: 0,
            testStarted: false,
            waitingForInput: true,
            lastInputReceivedNS: null,
            lastInputReceivedUnixMS: null
        };
    }

    public async newInputReceived(): Promise<void> {
        if (!this.metricState.waitingForInput) {
            throw new Error("Keypress metrics was not expecting an input!");
        }

        // Saves current time in nanoseconds (used for higher precision)
        this.metricState.lastInputReceivedNS = process.hrtime.bigint();
        // Saves current time in milliseconds since Unix epoch time
        this.metricState.lastInputReceivedUnixMS = Date.now();
        // Allows NewOutputReceived() to be called without exception
        this.metricState.waitingForInput = false;

        // Test has started when receiving first input
        this.metricState.testStarted = true;
    }

    public async newOutputReceived(): Promise<void> {
        // Ignore output before the test has started (we have received a single
        // input)
        if (!this.metricState.testStarted) return;

        const keyPressMetricEvent = this.endKeyPressMetricEvent();

        // Post event to metrics server
        // TODO-metrics: Do this in the background
        await this.postLatencyV1ToMetricsServer({
            startTime: keyPressMetricEvent.startTimeUnixMs,
            endTime: keyPressMetricEvent.endTimeUnixMs,
            deltaMs: keyPressMetricEvent.deltaMS,
            connectionId: this.connectionId,
            sequenceNumber: keyPressMetricEvent.sequenceNumber,
            service: "zli",
            description: "metrics gathered at the zli"
        })
    }

    private async postLatencyV1ToMetricsServer(payload: LatencyV1MetricsRequest) {
        this.logger.info(`Got a new latency v1 metrics event: ${JSON.stringify(payload, null, 4)}`);
        // TODO-metrics: Process this in background
        await this.metricsHttpService.PostLatencyMetricsV1(payload);
    }

    private endKeyPressMetricEvent(): KeyPressMetricEvent {
        if (this.metricState.waitingForInput) {
            throw new Error("Keypress metrics was not expecting an output!");
        }
        const outputTimeNS = process.hrtime.bigint();
        const outputTimeUnixMS = Date.now();

        // At this point, lastInputReceivedUnixMS and lastInputReceivedNS cannot be null

        const deltaMs = outputTimeUnixMS - this.metricState.lastInputReceivedUnixMS;
        const deltaNs = outputTimeNS - this.metricState.lastInputReceivedNS;

        const keyPressMetricEvent: KeyPressMetricEvent = {
            sequenceNumber: this.metricState.sequenceNumber,
            startTimeUnixMs: this.metricState.lastInputReceivedUnixMS,
            endTimeUnixMs: outputTimeUnixMS,
            deltaMS: deltaMs,
            deltaNS: deltaNs
        }

        // Allows NewInputReceived() to be called without exception
        this.metricState.waitingForInput = true;

        // Reset metrics
        this.metricState.lastInputReceivedUnixMS = null;
        this.metricState.lastInputReceivedNS = null;
        this.metricState.sequenceNumber++;

        return keyPressMetricEvent;
    }
}