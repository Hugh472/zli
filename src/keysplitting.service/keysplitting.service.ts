import * as ed from 'noble-ed25519';
import { HelloMsg, newHelloMsg } from './keysplitting.service.types';
import { SHA3 } from 'sha3';
import * as crypto from 'crypto';
import { KeySplittingConfigService } from './keysplitting-config.service';
import { Logger } from "../../src/logger.service/logger";

export class KeySplittingService {
    private ksConfigService: KeySplittingConfigService;
    private logger: Logger;

    constructor(configService: KeySplittingConfigService, logger: Logger) {
        this.ksConfigService = configService;
        this.logger = logger;
    }

    // Creates m1 message to be sent to the bastion
    public async createHelloMsg(): Promise<HelloMsg> {
        const secretKey = this.createOrReadPrivateKey();
        const randV = this.generateRandV();
        const publicKey = await ed.getPublicKey(secretKey);
        const sigRandV = await ed.sign(randV, secretKey);

        return newHelloMsg(publicKey, sigRandV, randV);
    }

    // Creates nonce that is used as nonce parameter in authentication request
    // sent to the IdP.
    public createNonce(helloMsg: HelloMsg) : string {
        const hasher = new SHA3(512);
        // SHA3-512(base64(pubkey) || base64(signature) || base64(randv))
        const tohash = "".concat(helloMsg.pubkey, helloMsg.signature, helloMsg.randv);
        this.logger.debug(`hashing: ${tohash}`);
        hasher.update(tohash);

        return hasher.digest('hex');
    }

    private createOrReadPrivateKey(): Uint8Array {
        if (this.ksConfigService.secretKey()) {
            // Read and convert from base64
            const privateKey = Buffer.from(this.ksConfigService.secretKey(), 'base64');
            return privateKey;
        }
        else
        {
            // Create and set private key if it does not exist
            const privateKey: Uint8Array = ed.utils.randomPrivateKey();
            const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
            this.ksConfigService.setSecretKey(privateKeyBase64);
            return privateKey;
        }
    }

    private generateRandV() : Uint8Array {
        // Create random 256-bit value
        return crypto.randomBytes(32)
    }
}