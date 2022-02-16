export interface GAMetadata
{
    distinct_id: string,
    client_type: string, // 'CLI'
    UserSessionId: string
}

export interface TrackNewConnection extends GAMetadata
{
    ConnectionType: string
}