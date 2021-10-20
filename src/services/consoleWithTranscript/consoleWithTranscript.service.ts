import { TranscriptMessage } from './consoleWithTranscript.types';

import { Chalk } from 'chalk';

export class ConsoleWithTranscriptService {
    private transcript: TranscriptMessage[]

    constructor(
        private defaultColor? : Chalk,
    ) {
        this.transcript = [];
    }

    public getTranscript(): readonly TranscriptMessage[] {
        return this.transcript;
    }

    public log(msg: string, pushToTranscript: boolean = true): void {
        if (this.defaultColor)
            msg = this.defaultColor(msg);
        console.log(msg);
        if (pushToTranscript)
            this.pushToTranscript(msg);
    }

    private stripAnsi(text: string) : string {
        // Regex for removing all ANSI codes
        // Source: https://stackoverflow.com/a/29497680
        return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    }

    public pushToTranscript(msg: string): void {
        // Strip all ANSI escape codes (e.g. color codes)
        const strippedMsg = this.stripAnsi(msg);

        // Push to transcript
        this.transcript.push({
            text: strippedMsg,
            timestamp: new Date()
        });
    }
}