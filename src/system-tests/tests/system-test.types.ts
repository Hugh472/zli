import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanRegion } from '../digital-ocean/digital-ocean.types';

/**
 * SSMTestTargetAutoDiscovery represents an SSM test target that should be
 * registered using the traditional, all-in-bash autodiscovery script that is
 * retrieved from the backend.
 */
export type SSMTestTargetAutoDiscovery = {
    installType: 'ad';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

/**
 * SSMTestTargetSelfRegistrationAutoDiscovery represents an SSM test target that
 * should be registered using the new, self-registration flow built into the
 * agent itself.
 */
export type SSMTestTargetSelfRegistrationAutoDiscovery = {
    installType: 'pm';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

/**
 * VTTestTarget represents an virtual target test that uses our new agent
 */
export type VTTestTarget = {
    installType: 'pm-vt';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

export type TestTarget = SSMTestTargetAutoDiscovery | SSMTestTargetSelfRegistrationAutoDiscovery | VTTestTarget