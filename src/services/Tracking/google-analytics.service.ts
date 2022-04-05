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
        'zli-version': 'cd3',
        'service-url': 'cd4',
        'zli-args': 'cd5'
    }

    constructor(private configService: ConfigService, private logger: Logger, private baseCommand: string, args: string[], version: string)
    {
        // Set up our user + GA info
        this.userId = this.configService.me().id;
        const gaToken = configService.GAToken();

        this.visitor = ua(gaToken, this.userId, {uid: this.userId});

        // Set our custom dimensions
        this.visitor.set(this.customDimensionMapper['zli-os'], process.platform);
        let argsToLog = args.toString();
        if (argsToLog == '') {
            // Appflow will not pull values if the custom dimension is empty
            // if we have no args, set this value to n/a
            argsToLog = 'n/a';
        }
        this.visitor.set(this.customDimensionMapper['zli-args'], argsToLog);
        this.visitor.set(this.customDimensionMapper['user-id'], this.userId);
        this.visitor.set(this.customDimensionMapper['zli-version'], version);
        this.visitor.set(this.customDimensionMapper['service-url'], configService.getBastionUrl());
    }

    /**
     * Helper function to track a cli command.
    */
    public async TrackCliCommand() {
        const zliCommandCall = new Promise<void>(async (resolve, _) => {
            await this.visitor.event('zli-command', this.baseCommand, (err: any) => {
                if (err) {
                    this.logger.debug(`Error sending GA event zli-command: ${err}`);
                } else {
                    this.logger.debug('Successfully tracked event');
                }
                resolve();
            });
        });
        await zliCommandCall;
    }

    /**
     * Helper function to track a cli error.
    */
    public async TrackError() {
        const zliErrorCall = new Promise<void>(async (resolve, _) => {
            await this.visitor.event('zli-error', this.baseCommand, (err: any) => {
                if (err) {
                    this.logger.error(`Error sending GA event zli-error: ${err}`);
                } else {
                    this.logger.debug('Successfully tracked event');
                }
                resolve();
            });
        });
        await zliErrorCall;
    }
}
