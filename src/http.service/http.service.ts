import { TargetType } from '../types';
import got, { Got } from 'got/dist/source';
import { Dictionary } from 'lodash';
import { CloseConnectionRequest, CloseSessionRequest, CloseSessionResponse, ConnectionSummary, CreateConnectionRequest, CreateConnectionResponse, CreateSessionRequest, CreateSessionResponse, ListSessionsResponse, SessionDetails, SshServerInfo as SshServerSummary, SsmTargetInfo as SsmTargetSummary } from './http.service.types';

export class HttpService
{
    // ref for got: https://github.com/sindresorhus/got
    private httpClient: Got;

    // TODO: oauth flow, read jwt from config
    constructor(baseUrl: string, apiSecret: string)
    {
        this.httpClient = got.extend({
            prefixUrl: baseUrl,
            headers: {'X-API-KEY': apiSecret},
        });
    }

    protected async Get<TResp>(route: string, queryParams: Dictionary<string>) : Promise<TResp>
    {
        var resp : TResp = await this.httpClient.get(
            route,
            {
                searchParams: queryParams,
                parseJson: text => JSON.parse(text),
            }
        ).json();

        return resp;
    }

    protected async Post<TReq, TResp>(route: string, body: TReq) : Promise<TResp>
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

export class SessionService extends HttpService
{

    constructor(baseUrl: string, apiSecret: string)
    {
        super(baseUrl + 'api/v1/session/', apiSecret);
    }

    public GetSession(sessionId: string) : Promise<SessionDetails>
    {
        return this.Get('', {id: sessionId});
    }

    public ListSessions() : Promise<ListSessionsResponse>
    {
        return this.Post('list', {});
    }

    public async CreateSession(sessionName? : string) : Promise<string>
    {
        var req : CreateSessionRequest;
        
        if(sessionName)
            req.displayName = sessionName;

        const resp = await this.Post<CreateSessionRequest, CreateSessionResponse>('create', req);

        return resp.sessionId;
    }

    public CloseSession(sessionId: string) : Promise<CloseSessionResponse>
    {
        var req : CloseSessionRequest = {sessionId: sessionId}
        return this.Post('close', req);
    }
}

export class ConnectionService extends HttpService
{
    constructor(baseUrl: string, apiSecret: string)
    {
        super(baseUrl + 'api/v1/connection/', apiSecret);
    }

    public GetConnection(connectionId: string) : Promise<ConnectionSummary>
    {
        return this.Get('', {id: connectionId});
    }

    public async CreateConnection(targetType: TargetType, targetId: string, sessionId: string) : Promise<string>
    {
        var req : CreateConnectionRequest = {
            serverType: targetType, 
            serverId: targetId, 
            sessionId: sessionId
        };

        const resp = await this.Post<CreateConnectionRequest, CreateConnectionResponse>('create', req);

        return resp.connectionId;
    }

    public CloseConnection(connectionId: string) : Promise<any>
    {
        var req : CloseConnectionRequest = {
            connectionId: connectionId
        };

        return this.Post('close', req);
    }
}

export class SsmTargetService extends HttpService
{
    constructor(baseUrl: string, apiSecret: string)
    {
        super(baseUrl + 'api/v1/ssmTarget/', apiSecret);
    }

    public GetSsmTarget(targetId: string) : Promise<SsmTargetSummary>
    {
        return this.Get('', {id: targetId});
    }

    public ListSsmTargets() : Promise<SsmTargetSummary[]>
    {
        return this.Post('list', {});
    }
}

export class SshTargetService extends HttpService
{
    constructor(baseUrl: string, apiSecret: string)
    {
        super(baseUrl + 'api/v1/sshTarget/', apiSecret);
    }

    public GetSsmTarget(targetId: string) : Promise<SshServerSummary>
    {
        return this.Get('', {id: targetId});
    }

    public ListSsmTargets() : Promise<SshServerSummary[]>
    {
        return this.Post('list', {});
    }
}