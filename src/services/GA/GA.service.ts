import { ConfigService } from '../config/config.service';
import { Logger } from '../logger/logger.service';
const ua = require('universal-analytics');

export class GAService
{
    private userId: string;
    private visitor: any;

    private customDimensionMapper: { [key: string ]: string } = {
        'zli-os': 'cd1',
        'user-id': 'cd2',
        'zli-version': 'cd3'
    }

    constructor(private configService: ConfigService, private logger: Logger, private baseCommand: string, version: string)
    {   
        // Set up our user + GA info
        this.userId = this.configService.me().id;
        this.visitor = ua('UA-216204125-3', {uid: this.userId});

        // Set our custom dimensions
        this.visitor.set(this.customDimensionMapper['zli-os'], process.platform);
        this.visitor.set(this.customDimensionMapper['user-id'], this.userId);
        this.visitor.set(this.customDimensionMapper['zli-version'], version);
    }

    /**
     * Helper function to track a cli command.
     * @param {string[]} args Args to the command
    */
    public TrackCliCommand(args: string[]) {
        this.visitor.event('zli-command', this.baseCommand, (err: any) => {
            if (err) {
                this.logger.error(`Error sending GA event: ${err}`);
            } else {
                this.logger.debug('Successfully tracked event')
            }
        });
        this.visitor.event('zli-args', args.toString(), (err: any) => {
            if (err) {
                this.logger.error(`Error sending GA event: ${err}`);
            } else {
                this.logger.debug('Successfully tracked event')
            }
        });
    }

    /**
     * Helper function to track a cli error.
    */
    public TrackError() {
        this.visitor.event('zli-error', this.baseCommand, (err: any) => {
            if (err) {
                this.logger.error(`Error sending GA event: ${err}`);
            } else {
                this.logger.debug('Successfully tracked event')
            }
        });
    }
}