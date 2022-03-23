import { Logger } from '../services/logger/logger.service';


export async function cleanExit(exitCode: number, logger: Logger) {
    await logger.flushLogs();

    if (exitCode != 0) {
        // If we have a non-zero exit code report that back to GA
        await logger.logGAError();
    }
    process.exit(exitCode);
}