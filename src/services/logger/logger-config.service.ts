import path from 'path';
import Conf from 'conf/dist/source';
import { error } from 'console';


// All logs are written to a single file, ~~~forever~~~
export type LoggerConfigSchema = {
    logPath: string
    daemonLogPath: string
}

export class LoggerConfigService {
    private config: Conf<LoggerConfigSchema>;

    constructor(configName: string, configDir?: string) {
        const projectName = 'bastionzero-logger';

        // If a custom configDir append the projectName to the path to keep
        // consistent behavior with conf so that different projectName's wont
        // overlap and use the same configuration file.
        if(configDir) {
            configDir = path.join(configDir, projectName);
        }

        this.config = new Conf<LoggerConfigSchema>({
            projectName: projectName,
            cwd: configDir,
            configName: configName,
            defaults: {
                logPath: undefined,
                daemonLogPath: undefined
            }
        });

        if(! this.config.get('logPath'))
            this.config.set('logPath', this.generateLogPath(configName, 'zli'));
        if (!this.config.get('daemonLogPath'))
            this.config.set('daemonLogPath', this.generateLogPath(configName, 'daemon'));
    }

    private generateLogPath(configName: string, configType: string): string {
        switch (configName) {
        case 'prod':
            return path.join(path.dirname(this.config.path), `bastionzero-${configType}.log`);

        case 'stage':
            return path.join(path.dirname(this.config.path), `bastionzero-${configType}-stage.log`);

        case 'dev':
            return path.join(path.dirname(this.config.path), `bastionzero-${configType}-dev.log`);
        default:
            throw error('Unrecognized configName');
        }
    }

    public logPath(): string {
        return this.config.get('logPath');
    }

    public daemonLogPath(): string {
        return this.config.get('daemonLogPath');
    }

    public configPath(): string {
        return this.config.path;
    }
}
