import { TargetType } from '../../../webshell-common-ts/http/v2/target/types/target.types';
import { Dictionary } from 'lodash';
import { ConfigService } from '../config/config.service';
import { TrackNewConnection } from './GA.service.types';
import { Logger } from '../logger/logger.service';
const ua = require('universal-analytics');

export class GAService
{
    private userId: string;
    private sessionId: string;
    private visitor: any;

    private customDimensionMapper: { [key: string ]: string } = {
        'zli-os': 'cd1',
        'user-id': 'cd2'
    }

    constructor(private configService: ConfigService, private logger: Logger)
    {
        this.userId = this.configService.me().id;
        this.sessionId = this.configService.sessionId();
        this.visitor = ua('UA-216204125-3', {uid: this.userId});


        this.visitor.set(this.customDimensionMapper['zli-os'], process.platform);
        this.visitor.set(this.customDimensionMapper['user-id'], this.userId);
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

    }

    public TrackCliCommand(version: string, command: string, args: string[]) {

        this.visitor.event('zli-command', command, (err: any) => {
            if (err) {
                this.logger.error(`Error sending GA event: ${err}`);
            } else {
                this.logger.debug('Succesfully tracked event')
            }
        });
    }
}