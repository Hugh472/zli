import { ConfigService } from '../config/config.service';

import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import mixpanel, { Mixpanel } from 'mixpanel';
import { TrackNewConnection } from './mixpanel.service.types';


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
        this.sessionId = this.configService.getSessionId();
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
