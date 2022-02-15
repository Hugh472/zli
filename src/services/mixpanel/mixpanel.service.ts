import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import mixpanel, { Mixpanel } from 'mixpanel';
import { ConfigService } from '../config/config.service';
import { TrackNewConnection } from './mixpanel.service.types';
import { Logger } from '../logger/logger.service';
const ua = require('universal-analytics');

export class GAService
{
    private mixpanelClient: Mixpanel;
    private userId: string;
    private sessionId: string;
    private visitor: any;

    private customDimensionMapper: { [key: string ]: string } = {
        'zli-os': 'cd1'
    }

    constructor(private configService: ConfigService, private logger: Logger)
    {
        this.userId = this.configService.me().id;
        this.sessionId = this.configService.sessionId();
        this.visitor = ua('UA-216204125-3', {uid: this.userId});


        this.visitor.set(this.customDimensionMapper['zli-os'], process.platform);
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
    }
}