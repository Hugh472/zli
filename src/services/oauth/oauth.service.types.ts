export class UserNotLoggedInError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'UserNotLoggedIn';
    }
}

export class RefreshTokenError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'RefreshTokenError';
    }
}