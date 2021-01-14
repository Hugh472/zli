// Corresponds to m1 in the keysplitting docs
// Fields are base64-encoded
export interface HelloMsg {
    pubkey: string;
    signature: string;
    randv: string;
}

export function newHelloMsg(publicKey: Uint8Array, signature: Uint8Array, randv: Uint8Array): HelloMsg {
    return {
        pubkey: Buffer.from(publicKey).toString('base64'),
        signature: Buffer.from(signature).toString('base64'),
        randv: Buffer.from(randv).toString('base64'),
    }
}