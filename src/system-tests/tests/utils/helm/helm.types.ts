export type Release = {
    name: string,
    namespace: string,
    revision: string,
    updated: string,
    status:
        'unknown' |
        'deployed' |
        'uninstalled' |
        'superseded' |
        'failed' |
        'uninstalling' |
        'pending-install' |
        'pending-upgrade' |
        'pending-rollback'
    chart: string,
    app_version: string
}

export type Repo = {
    name: string,
    url: string,
}
