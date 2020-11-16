import got, { Got } from 'got/dist/source';
// import { Dictionary } from 'lodash';

export class HttpService
{
    // ref for got: https://github.com/sindresorhus/got
    private httpClient: Got;

    // TODO: oauth flow
    constructor(baseUrl: string, apiSecret: string)
    {
        this.httpClient = got.extend({
            prefixUrl: baseUrl,
            headers: {'X-API-KEY': apiSecret},
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