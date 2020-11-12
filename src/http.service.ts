import got, { Got } from 'got/dist/source';
// import { Dictionary } from 'lodash';

export class HttpService
{
    private baseUrl: string = "https://webshell-development-vpc-0917-115500-nabeel.clunk80.com/"; // TODO: read from config
    private jwt: string; // TODO: store in config on start up
    // ref for got: https://github.com/sindresorhus/got
    private httpClient: Got;

    constructor(jwt: string)
    {
        this.jwt = jwt;

        this.httpClient = got.extend({
            prefixUrl: this.baseUrl,
            headers: {authorization: this.jwt},
        });
    }

    public async Get<TResp>(route: string) : Promise<TResp>
    {
        var resp : TResp = await this.httpClient.get(
            route,
            {
                // searchParams: queryParams is Dictionary<string>
                parseJson: text => JSON.parse(text),
            }
        ).json();

        return resp;
    }

    public async Post<TReq, TResp>(route: string, body: TReq) : Promise<TResp>
    {
        var resp : TResp = await this.httpClient.post(
            route,
            {
                json: body,
                parseJson: text => JSON.parse(text)
            }
        ).json();

        return resp;
    }
}