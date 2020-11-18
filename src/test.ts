import { AuthorizationParameters, Client, generators, Issuer, TokenSet } from "openid-client";
import http from 'http';
import { RequestListener } from "http";
import open from 'open';
import { ChildProcess } from "child_process";
import got from "got/dist/source";


var client: Client;
const code_verifier = generators.codeVerifier();
const code_challenge = generators.codeChallenge(code_verifier);
var browserProcess: ChildProcess;
var tokenSet: TokenSet;

const run = async () =>
{
    // TODO: read authority from config
    const clunk80Auth = await Issuer.discover('https://auth-webshell-development-vpc-0917-115500-nabeel.clunk80.com:5003');

    // should be equivalent to the server definition
    // ref: https://github.com/cwcrypto/webshell-backend/blob/01228d26197be1f84ad07832c155b7a82d3fe435/Webshell.IdentityServer/Configuration/IdentityServerConfig.cs#L46
    client = new clunk80Auth.Client({
        client_id: 'CLI',
        redirect_uris: ['http://127.0.0.1:3000/login-callback' ],
        post_logout_redirect_uris: ['http://127.0.0.1:3000/logout-callback'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        // id_token_signed_response_alg (default "RS256")
        // token_endpoint_auth_method (default "client_secret_basic")
    });

    // parameters that get serialized into the url
    var authParams : AuthorizationParameters = {
        client_id: 'CLI',
        code_challenge: code_challenge,
        code_challenge_method: 'S256',
        // both openid and offline_access must be set for refresh token
        // strangely enough I do not need 'backend-api' scope at the moment
        // leaving it in just in case we enforce it later
        scope: 'openid offline_access email profile backend-api',
    };

    browserProcess = await open(client.authorizationUrl(authParams));
}

const host = '127.0.0.1';
const port = 3000;

const requestListener : RequestListener = async (req, res) => {
    res.writeHead(200);
    res.end();

    switch (req.url.split('?')[0]) {
        case "/login-callback":
            const params = client.callbackParams(req);
            tokenSet = await client.callback('http://127.0.0.1:3000/login-callback', params, { code_verifier });
            console.log('Tokens received and validated');
            const userInfo = await client.userinfo(tokenSet.access_token);

            // call some service here?

            // var resp = await got.post('https://webshell-development-vpc-0917-115500-nabeel.clunk80.com/api/v1/session/list', {headers: {authorization: `${tokenSet.token_type} ${tokenSet.access_token}`}, json: {payload: {}}}).json();
            // console.log(resp);
            break;
        
        case "/logout-callback":
            console.log('logout callback');
            break;

        default:
            console.log(`default callback at: ${req.url.split('?')[0]}`);
            break;
    }
    
    
};

const server = http.createServer(requestListener);
server.listen(port, host, () => {
});

run();
