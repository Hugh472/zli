import got, { Got } from 'got/dist/source';
import { Dictionary } from 'lodash';


// ref for got: https://github.com/sindresorhus/got
export class HttpService
{
    private baseUrl: string = "https://webshell-development-vpc-0917-115500-nabeel.clunk80.com/"; // TODO: read from config
    private jwt: string; // TODO: store in config on start up
    private httpClient: Got;

    constructor(jwt: string)
    {
        this.jwt = jwt;

        this.httpClient = got.extend({
            prefixUrl: this.baseUrl,
            // headers: {authorization: this.jwt},
        });
    }

    public async Get<TResp>(route: string, queryParams?: Dictionary<string>) : Promise<TResp>
    {
        var resp = await this.httpClient.get<TResp>(
            route,
            // {
            //     searchParams: queryParams
            // }
        );

        return resp.body;
    }

    public async Post<TReq, TResp>(route: string, body: TReq) : Promise<TResp>
    {
        var resp = await this.httpClient.post<TResp>(
            route,
            {
                json: body,
                responseType: 'json'
            }
        );

        return resp.body;
    }
}