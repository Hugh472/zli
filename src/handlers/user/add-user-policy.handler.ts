import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { cleanExit } from '../clean-exit.handler';
import { UserHttpService } from '../../http-services/user/user.http-services';
import { PolicyHttpService } from '../../http-services/policy/policy.http-services';
import { UserSummary } from '../../../webshell-common-ts/http/v2/user/types/user-summary.types';
import { SubjectType } from '../../../webshell-common-ts/http/v2/common.types/subject.types';
import { Subject } from '../../../webshell-common-ts/http/v2/policy/types/subject.types';

export async function addUserToPolicyHandler(userEmail: string, policyName: string, configService: ConfigService, logger: Logger) {
    // First ensure we can lookup the user
    const userHttpService = new UserHttpService(configService, logger);

    let userSummary: UserSummary = null;
    try {
        userSummary = await userHttpService.GetUserByEmail(userEmail);
    } catch (error) {
        logger.error(`Unable to find user with email: ${userEmail}`);
        await cleanExit(1, logger);

    }

    // Get the existing policy
    const policyHttpService = new PolicyHttpService(configService, logger);
    const kubePolicies = await policyHttpService.ListKubernetesPolicies();
    const targetPolicies = await policyHttpService.ListTargetConnectPolicies();

    // Loop till we find the one we are looking for
    const kubePolicy = kubePolicies.find(p => p.name == policyName);
    const targetPolicy = targetPolicies.find(p => p.name == policyName);

    if (!kubePolicy && !targetPolicy) {
        // Log an error
        logger.error(`Unable to find policy with name: ${policyName}`);
        await cleanExit(1, logger);
    }

    if (kubePolicy) {
        // If this user exists already
        if (kubePolicy.subjects.find(s => s.type === SubjectType.User && s.id === userSummary.id)) {
            logger.error(`User ${userEmail} exists already for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // Then add the user to the policy
        const subjectToAdd: Subject = {
            id: userSummary.id,
            type: SubjectType.User
        };

        // And finally update the policy
        kubePolicy.subjects.push(subjectToAdd);

        await policyHttpService.EditKubernetesPolicy(kubePolicy);
    } else if (targetPolicy) {
        // If this user exists already
        if (targetPolicy.subjects.find(s => s.type === SubjectType.User && s.id === userSummary.id)) {
            logger.error(`User ${userEmail} exists already for policy: ${policyName}`);
            await cleanExit(1, logger);
        }

        // Then add the user to the policy
        const subjectToAdd: Subject = {
            id: userSummary.id,
            type: SubjectType.User
        };

        // And finally update the policy
        targetPolicy.subjects.push(subjectToAdd);

        await policyHttpService.EditTargetConnectPolicy(targetPolicy);
    } else {
        logger.error(`Adding user to policy ${policyName} failed. Adding users to this policy type is not currently supported.`);
        await cleanExit(1, logger);
    }

    logger.info(`Added ${userEmail} to ${policyName} policy!`);
    await cleanExit(0, logger);
}

