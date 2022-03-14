import { ConfigService } from '../../../../src/services/config/config.service';
import { Logger } from '../../../services/logger/logger.service';
import { EventsHttpService } from '../../../../src/http-services/events/events.http-server';
import { ConnectionEventType } from '../../../../webshell-common-ts/http/v2/event/types/connection-event.types';
import { ConnectionEventResponse } from '../../../../webshell-common-ts/http/v2/event/response/connection-event-data-message';
import { configService } from '../system-test';
import { LoggerConfigService } from '../../../../src/services/logger/logger-config.service';
import { SubjectType } from '../../../../webshell-common-ts/http/v2/common.types/subject.types';

const fs = require('fs');
const pids = require('port-pid');

const EVENT_QUERY_TIME = 2;
const SLEEP_TIME = 5;

/**
 * Class that contains our common testing functions that can be used across tests
 */
export class TestUtils {
    eventsService: EventsHttpService;
    loggerConfigService: LoggerConfigService;
    logger: Logger;
    sleepTimeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    constructor(configService: ConfigService, logger: Logger, loggerConfigService: LoggerConfigService) {
        this.eventsService = new EventsHttpService(configService, logger);
        this.loggerConfigService = loggerConfigService;
        this.logger = logger;
    };

    /**
     * Helper function to build a connection event so we can verify it exist in our backend
     * @param {string} targetId Target id we are looking fo
     * @param {string} targetName Target name we are looking for
     * @param {string} targetUsers Target user we are connected as
     * @param {string} targetType Target type we are looking for (i.e. CLUSTER)
     * @param {ConnectionEventType} eventType Event we are checking for
     */
    private async BuildConnectionEvent(targetId: string, targetName: string, targetUser: string, targetType: string, eventType: ConnectionEventType): Promise<ConnectionEventResponse> {
        const me = configService.me();
        const toReturn: ConnectionEventResponse = {
            id: expect.anything(),
            connectionId: expect.anything(),
            subjectId: me.id,
            subjectType: SubjectType.User,
            userName: me.email,
            organizationId: me.organizationId,
            sessionId: expect.anything(),
            sessionName: expect.anything(),
            targetId: targetId,
            targetType: targetType,
            targetName: targetName,
            targetUser: targetUser,
            timestamp: expect.anything(),
            connectionEventType: eventType,
            reason: expect.anything()
        };
        return toReturn;
    }
    /**
     * Helper function to ensure that a connection event was created
     * (i.e. client connect -> closed exists in our db events logs)
     * @param {string} targetId Target id we are looking for
     * @param {string} targetName Target name we are looking for
     * @param {string} targetUsers Target user we are connected as
     * @param {string} targetType Target type we are looking for (i.e. CLUSTER)
     * @param {ConnectionEventType} eventType Event we are checking for
     */
    public async EnsureConnectionEventCreated(targetId: string, targetName: string, targetUser: string, targetType: string, eventType: ConnectionEventType) {
        // Sometimes the system test goes too fast before the event
        // is propagated to our database, retry getting the event 3 times with some sleep in between
        let failures = 0;
        let eventCreated: ConnectionEventResponse = undefined;

        while (failures < 5) {
            // Query for our events
            const startTimestamp = new Date();
            startTimestamp.setHours(startTimestamp.getHours() - EVENT_QUERY_TIME);
            const events = await this.eventsService.GetConnectionEvents(startTimestamp, [configService.me().id]);

            eventCreated = events.find(event => {
                if (event.targetId == targetId && event.targetType == targetType) {
                    if (event.connectionEventType == eventType) {
                        return true;
                    }
                };
            });

            if (eventCreated == undefined) {
                failures += 1;
                this.logger.warn(`Unable to find event for targetId ${targetId} for type ${eventType}, sleeping for ${SLEEP_TIME}s and trying again. Failures: ${failures}`);
                await this.sleepTimeout(SLEEP_TIME * 1000);
            } else {
                // We were able to find the event, break
                break;
            }
        }

        if (eventCreated == undefined) {
            throw new Error(`Unable to find event for targetId ${targetId} for type ${eventType}`);
        }

        // Build our connection event
        const connectionEvent = this.BuildConnectionEvent(targetId, targetName, targetUser, targetType, eventType);

        // Ensure the values match
        expect(eventCreated).toMatchObject(connectionEvent);
    }

    /**
     * Helper function to ensure we see a given kube event
     * @param {string} targetName Target name we are hitting
     * @param {string} role Target role we want to connect as
     * @param {string[]} targetGroup List of target group we want to connect as
     * @param {string} kubeEnglishCommand Kube english command we are expecting
     * @param {string[]} expectedEndpoints List of expected endpoints to have been hit
     */
    public async EnsureKubeEvent(targetName: string, role: string, targetGroup: string[], kubeEnglishCommand: string, expectedEndpoints: string[], expectedExecs: string[]) {
        const kubeEvents = await this.eventsService.GetKubeEvents();
        const me = configService.me();

        const eventWindow = new Date();
        eventWindow.setHours(eventWindow.getHours() - EVENT_QUERY_TIME);

        const kubeEvent = kubeEvents.find(kubeEvent => {
            // Check the basic values that we expect
            if (kubeEvent.targetName == targetName &&
                kubeEvent.role == role &&
                kubeEvent.targetGroups  == targetGroup &&
                kubeEvent.kubeEnglishCommand == kubeEnglishCommand &&
                kubeEvent.userId == me.id &&
                kubeEvent.userEmail == me.email) {
                // Ensure this event has happened recently
                if (kubeEvent.creationDate < eventWindow) {
                    return false;
                }

                // Check the actual endpoint events
                for (let index = 0; index < expectedEndpoints.length; index += 1) {
                    const expectedEndpoint = expectedEndpoints[index];
                    // Check if that expected endpoint is in the list of endpoints
                    if (kubeEvent.endpoints.find(e => e.event == expectedEndpoint) === undefined) {
                        return false;
                    }
                }

                // Check the actual exec events
                for (let index = 0; index < expectedExecs.length; index += 1) {
                    const expectedExec = expectedExecs[index];
                    // Check if that expected endpoint is in the list of endpoints
                    if (kubeEvent.execCommands.find(e => e.event == expectedExec) === undefined) {
                        return false;
                    }
                }

                // Everything has evaluated, return true
                return true;
            }
        });

        // If we are able to validate and find our kube event, return true
        return (kubeEvent !== undefined);
    }

    /**
     * Helper function to check if a test passed, and if not log the contents of the daemon logs
     * @param {boolean} testPassed Boolean to indicate if the test passed or not
     * @param {string} testName Test name to log incase of failure
     */
    public async CheckDaemonLogs(testPassed: boolean, testName: string) {
        const daemonLogPath = this.loggerConfigService.daemonLogPath();
        if (!fs.existsSync(daemonLogPath)) {
            this.logger.warn(`No daemon logs found under ${daemonLogPath}`);
            return;
        };

        if (!testPassed) {
            // Print the logs from the daemon
            try {
                const daemonLogs = fs.readFileSync(daemonLogPath, 'utf8');
                this.logger.error(`Test failed: ${testName}! Daemon logs:\n${daemonLogs}`);
            } catch (err) {
                this.logger.error(`Error reading logs from daemon log file: ${daemonLogPath}. Error: ${err}`);
            }
        }

        // Always delete the daemon log file after each test
        try {
            fs.unlinkSync(daemonLogPath);
        } catch(err) {
            this.logger.error(`Error deleting daemon log file: ${daemonLogPath}. Error: ${err}`);
        }
    }

    /**
     * Helper function to check if there are process' on a given port
     * @param {number} port Port to check
     */
    public async CheckPort(port: number) {
        const ports = new Promise<number[]>(async (resolve, _) => {
            pids(port).then((pids: any) => {
                resolve(pids.tcp);
            });
        });
        if ((await ports).length != 0) {
            throw new Error(`There are currently processes using port ${port}: ${ports}`);
        }
    }
}

