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
        this.visitor = ua('UA-223035536-1', {uid: this.userId});

        // Set our custom dimensions
        this.visitor.set(this.customDimensionMapper['zli-os'], process.platform);
        this.visitor.set(this.customDimensionMapper['user-id'], this.userId);
        this.visitor.set(this.customDimensionMapper['zli-version'], version);
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
