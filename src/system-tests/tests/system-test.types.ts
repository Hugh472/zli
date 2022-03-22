import { DigitalOceanDistroImage } from '../digital-ocean/digital-ocean-ssm-target.service.types';
import { DigitalOceanRegion } from '../digital-ocean/digital-ocean.types';

/**
 * SSMTestTargetAutoDiscovery represents an SSM test target that should be
 * registered using the traditional, all-in-bash autodiscovery script that is
 * retrieved from the backend.
 */
export type SSMTestTargetAutoDiscovery = BaseTarget & {
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
export type SSMTestTargetSelfRegistrationAutoDiscovery = BaseTarget &{
    installType: 'pm';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

/**
 * VTTestTarget represents an virtual target test that uses our new agent
 */
export type VTTestTarget = BaseTarget & {
    installType: 'pm-vt';
    dropletImage: DigitalOceanDistroImage;
    doRegion: DigitalOceanRegion;
    awsRegion: string;
}

// Hold our common TestRails caseIds
interface BaseTarget {
    sshCaseId?: string // For our ssh test suite
    connectCaseId?: string; // For our connect test suite
    dbCaseId?: string; // For our vt test suite
    webCaseId?: string; // For our vt test suite
}

export type TestTarget = SSMTestTargetAutoDiscovery | SSMTestTargetSelfRegistrationAutoDiscovery | VTTestTarget