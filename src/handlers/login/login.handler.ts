import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { OAuthService } from '../../services/oauth/oauth.service';
import { KeySplittingService } from '../../../webshell-common-ts/keysplitting.service/keysplitting.service';

import qrcode from 'qrcode';
import { MfaService } from '../../services/v1/mfa/mfa.service';
import { MfaActionRequired } from '../../services/v1/mfa/mfa.types';
import { UserService } from '../../services/v1/user/user.service';
import yargs from 'yargs';
import { loginArgs } from './login.command-builder';
import { UserSummary } from '../../services/v1/user/user.types';
import { UserRegisterResponse } from '../../services/v1/user/user.messages';
import prompts, { PromptObject } from 'prompts';
import { MfaHttpService } from 'http-services/mfa/mfa.http-services';
import { UserHttpService } from 'http-services/user/user.http-services';

export interface LoginResult {
    userSummary: UserSummary;
    userRegisterResponse: UserRegisterResponse;
}

function interactiveTOTPMFA(): Promise<string | undefined> {
    return new Promise<string | undefined>(async (resolve, _) => {
        const onCancel = () => resolve(undefined);
        const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
        await prompts({
            type: 'text',
            name: 'value',
            message: 'Enter MFA token:',
            validate: value => value ? true : 'Value is required. Use CTRL-C to exit'
        }, { onSubmit: onSubmit, onCancel: onCancel });
    });
}

function interactiveResetMfa(): Promise<string> {
    return new Promise<string | undefined>(async (resolve, _) => {
        const onCancel = () => resolve(undefined);
        const onSubmit = (_: PromptObject, answer: string) => resolve(answer);
        await prompts({
            type: 'text',
            name: 'value',
            message: 'Enter MFA code from authenticator app:',
            validate: value => value ? true : 'Value is required. Use CTRL-C to exit'
        }, { onSubmit: onSubmit, onCancel: onCancel });
    });
}

export async function login(keySplittingService: KeySplittingService, configService: ConfigService, logger: Logger, mfaToken?: string): Promise<LoginResult | undefined> {
    // Clear previous log in info
    configService.logout();
    await keySplittingService.generateKeysplittingLoginData();

    // Can only create oauth service after loginSetup completes
    const oAuthService = new OAuthService(configService, logger);
    if (!oAuthService.isAuthenticated()) {
        // Create our Nonce
        const nonce = keySplittingService.createNonce();

        // Pass it in as we login
        await oAuthService.login((t) => {
            configService.setTokenSet(t);
            keySplittingService.setInitialIdToken(configService.getAuth());
        }, nonce);
    }

    // Register user log in and get User Session Id
    const userHttpService = new UserHttpService(configService, logger);
    const registerResponse = await userHttpService.Register();
    configService.setSessionId(registerResponse.userSessionId);

    // Check if we must MFA and act upon it
    const mfaHttpService = new MfaHttpService(configService, logger);
    switch (registerResponse.mfaActionRequired) {
    case MfaActionRequired.NONE:
        break;
    case MfaActionRequired.TOTP:
        if (mfaToken) {
            await mfaHttpService.VerifyMfaTotp(mfaToken);
        } else {
            logger.info('MFA token required for this account');
            const token = await interactiveTOTPMFA();
            if (token) {
                await mfaHttpService.VerifyMfaTotp(token);
            } else {
                return undefined;
            }
        }
        break;
    case MfaActionRequired.RESET:
        logger.info('MFA reset detected, requesting new MFA token');
        logger.info('Please scan the following QR code with your device (Google Authenticator recommended) and enter code below.');

        const resp = await mfaHttpService.ResetSecret(true);
        const data = await qrcode.toString(resp.mfaSecretUrl, { type: 'terminal', scale: 2 });
        console.log(data);

        const code = await interactiveResetMfa();
        if (code) {
            await mfaHttpService.VerifyMfaTotp(code);
        } else {
            return undefined;
        }

        break;
    default:
        logger.warn(`Unexpected MFA response ${registerResponse.mfaActionRequired}`);
        break;
    }

    const me = await userHttpService.Me();
    configService.setMe(me);

    return {
        userRegisterResponse: registerResponse,
        userSummary: me
    };
}

export async function loginHandler(configService: ConfigService, logger: Logger, argv: yargs.Arguments<loginArgs>, keySplittingService: KeySplittingService): Promise<LoginResult | undefined> {
    logger.info('Login required, opening browser');
    return login(keySplittingService, configService, logger, argv.mfa);
}