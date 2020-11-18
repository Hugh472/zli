import { AuthorizationParameters, Client, generators, Issuer, TokenSet } from "openid-client";
import http from 'http';
import { RequestListener } from "http";
import open from 'open';
import { ChildProcess } from "child_process";


var client: Client;
const code_verifier = generators.codeVerifier();
const code_challenge = generators.codeChallenge(code_verifier);
var browserProcess: Promise<ChildProcess>;
var tokenSet: TokenSet;


const run = async () =>
{
    const clunk80Auth = await Issuer.discover('https://auth-webshell-development-vpc-0917-115500-nabeel.clunk80.com:5003');

    client = new clunk80Auth.Client({
        client_id: 'CLI',
        // client_secret: 'TQV5U29k1gHibH5bx1layBo0OSAvAbRT3UYW3EWrSYBB5swxjVfWUa1BS8lqzxG/0v9wruMcrGadany3',
        redirect_uris: ['http://127.0.0.1:3000'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        // id_token_signed_response_alg (default "RS256")
        // token_endpoint_auth_method (default "client_secret_basic")
    });

    
    var authParams : AuthorizationParameters = {
        code_challenge: code_challenge,
        code_challenge_method: 'S256',
        scope: 'openid offline_access', // both openid and offline_access must be set for refresh token
        client_id: 'CLI'
    }

    browserProcess = open(client.authorizationUrl(authParams));

}

const host = '127.0.0.1';
const port = 3000;

const requestListener : RequestListener = async (req, res) => {
    const params = client.callbackParams(req);
    
    tokenSet = await client.callback('http://127.0.0.1:3000', params, { code_verifier });
    console.log('received and validated tokens %j', tokenSet); // refresh token in here
    console.log('validated ID Token claims %j', tokenSet.claims());

    const userInfo = await client.userinfo(tokenSet.access_token);
    console.log('userinfo %j', userInfo);
};

const server = http.createServer(requestListener);
server.listen(port, host, () => {
});

run();
