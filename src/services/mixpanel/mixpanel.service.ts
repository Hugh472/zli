import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import mixpanel, { Mixpanel } from 'mixpanel';
import { ConfigService } from '../config/config.service';
import { TrackNewConnection } from './mixpanel.service.types';
import { Logger } from '../logger/logger.service';
const ua = require('universal-analytics');

export class MixpanelService
{
    private mixpanelClient: Mixpanel;
    private userId: string;
    private sessionId: string;
    private visitor: any;

    constructor(private configService: ConfigService, private logger: Logger)
    {
        this.mixpanelClient = mixpanel.init(this.configService.mixpanelToken(), {
            protocol: 'https',
        });

        this.userId = this.configService.me().id;
        this.sessionId = this.configService.sessionId();
        this.visitor = ua('UA-216204125-3', {uid: this.userId});
        this.visitor.set("cd1", process.platform);
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
        // this.visitor.event("zli-command", args.toString(), (err: any) => {
            this.visitor.event("zli-command", command, (err: any) => {
            if (err) {
                // console.log(err);
                this.logger.error(`Error sending GA event: ${err}`);
            } else {
                // console.log("Successfully tracked event");
                this.logger.debug('Succesfully tracked event')
            }
        });


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