import Conf from 'conf/dist/source';

type ThoumConfigKeySplittingSchema = {
    secretKey: string
}

export class KeySplittingConfigService {
    private config: Conf<ThoumConfigKeySplittingSchema>;

    constructor(configName: string) {
        this.config = new Conf<ThoumConfigKeySplittingSchema>({
            projectName: "bastionzero-zli-keysplitting",
            configName: configName, // prod, stage, dev
            defaults: {
                secretKey: undefined
            },
            accessPropertiesByDotNotation: true,
            clearInvalidConfig: true    // if config is invalid, delete
        });
    }

    public configPath(): string {
        return this.config.path;
    }

    public secretKey(): string {
        return this.config.get('secretKey');
    }

    public setSecretKey(secretKey: string): void {
        this.config.set('secretKey', secretKey);
    }
}