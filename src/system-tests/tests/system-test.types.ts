import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';

/**
 * SSMTestTargetAutoDiscovery represents an SSM test target that should be
 * registered using the traditional, all-in-bash autodiscovery script that is
 * retrieved from the backend.
 */
export type SSMTestTargetAutoDiscovery = {
    installType: 'autodiscovery';
    dropletImage: DigitalOceanDistroImage;
}

/**
 * SSMTestTargetSelfRegistrationAutoDiscovery represents an SSM test target that
 * should be registered using the new, self-registration flow built into the
 * agent itself.
 */
export type SSMTestTargetSelfRegistrationAutoDiscovery = {
    installType: 'package-manager';
    dropletImage: DigitalOceanDistroImage;
}

export type SSMTestTarget = SSMTestTargetAutoDiscovery | SSMTestTargetSelfRegistrationAutoDiscovery