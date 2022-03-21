import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
const ua = require('universal-analytics');


import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import mixpanel, { Mixpanel } from 'mixpanel';
import { TrackNewConnection } from './mixpanel.service.types';

export class GAService
{
    private userId: string;
    private visitor: any;

    private customDimensionMapper: { [key: string ]: string } = {
        'zli-os': 'cd1',
        'user-id': 'cd2',
        'zli-version': 'cd3',
        'service-url': 'cd4'
    }

    constructor(private configService: ConfigService, private logger: Logger, private baseCommand: string, version: string)
    {   
        // Set up our user + GA info
        this.userId = this.configService.me().id;
        const gaToken = configService.GAToken(); 

        this.visitor = ua(gaToken, {uid: this.userId});

        // Set our custom dimensions
        this.visitor.set(this.customDimensionMapper['zli-os'], process.platform);
        this.visitor.set(this.customDimensionMapper['user-id'], this.userId);
        this.visitor.set(this.customDimensionMapper['zli-version'], version);
        this.visitor.set(this.customDimensionMapper['service-url'], configService.getBastionUrl())
    }

    /**
     * Helper function to track a cli command.
     * @param {string[]} args Args to the command
    */
    public async TrackCliCommand(args: string[]) {
        const zliCommandCall = new Promise<void>(async (resolve, _) => {
            await this.visitor.event('zli-command', this.baseCommand, (err: any) => {
                if (err) {
                    this.logger.error(`Error sending GA event zli-command: ${err}`);
                } else {
                    this.logger.debug('Successfully tracked event')
                }
                resolve();
            });
        });
        await zliCommandCall; 
        
        if (args.length != 0) {
            const zliArgsCall = new Promise<void>(async (resolve, _) => {
                await this.visitor.event('zli-args', args.toString(), (err: any) => {
                    if (err) {
                        this.logger.error(`Error sending GA event zli-args: ${err}`);
                    } else {
                        this.logger.debug('Successfully tracked event')
                    }
                    resolve();
                });
            });
            await zliArgsCall;
        }
    }

    /**
     * Helper function to track a cli error.
    */
    public async TrackError() {
        const zliErrorCall = new Promise<void>(async (resolve, _) => {
            await this.visitor.event('zli-error', 'lt', (err: any) => {
                if (err) {
                    this.logger.error(`Error sending GA event zli-error: ${err}`);
                } else {
                    this.logger.debug('Successfully tracked event')
                }
                resolve();
            });
        });
        await zliErrorCall;
    }
}

export class MixpanelService
{
    private mixpanelClient: Mixpanel;
    private userId: string;
    private sessionId: string;

    constructor(private configService: ConfigService)
    {
        this.mixpanelClient = mixpanel.init(this.configService.mixpanelToken(), {
            protocol: 'https',
        });

        this.userId = this.configService.me().id;
        this.sessionId = this.configService.sessionId();
    }


    // track connect calls
    public TrackNewConnection(targetType: TargetType): void
    {
        const trackMessage : TrackNewConnection = {
            distinct_id: this.userId,
            client_type: 'CLI',
            UserSessionId: this.sessionId,
            ConnectionType: targetType,
        };

        this.mixpanelClient.track('ConnectionOpened', trackMessage);
    }

    public TrackCliCall(eventName: string, properties: Dictionary<string | string[] | unknown>)
    {
        // append the following properties
        properties.distinct_id = this.userId;
        properties.client_type = 'CLI';
        properties.UserSessionId = this.sessionId;

        this.mixpanelClient.track(eventName, properties);
    }

    public TrackCliCommand(version: string, command: string, args: string[]) {
        this.TrackCliCall(
            'CliCommand',
            {
                'cli-version': version,
                'command': command,
                args: args
            }
        );
    }
}
