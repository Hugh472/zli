import { Droplet } from 'digitalocean-js';
import { SsmTargetSummary } from '../../services/ssm-target/ssm-target.types';

/**
 * String union of all DigitalOcean datacenters.
 * Source: https://docs.digitalocean.com/products/platform/availability-matrix/#available-datacenters
 */
export const DigitalOceanRegion = {
    NewYork1: 'nyc1',
    NewYork2: 'nyc2',
    NewYork3: 'nyc3',
    Amsterdam2: 'ams2',
    Amsterdam3: 'ams3',
    SanFrancisco1: 'sfo1',
    SanFrancisco2: 'sfo2',
    SanFrancisco3: 'sfo3',
    Singapore1: 'sgp1',
    London1: 'lon1',
    Frankfurt1: 'fra1',
    Toronto1: 'tor1',
    Bangalore1: 'blr1'
} as const;
export type DigitalOceanRegion = typeof DigitalOceanRegion[keyof typeof DigitalOceanRegion];

/**
 * String union of all droplet sizes with Class = "Basic". Source:
 * https://slugs.do-api.dev/
 */
export const DigitalOceanDropletSize = {
    CPU_1_MEM_1GB: 's-1vcpu-1gb',
    CPU_1_MEM_2GB: 's-1vcpu-2gb',
    CPU_2_MEM_4GB: 's-2vcpu-4gb',
    CPU_4_MEM_8GB: 's-4vcpu-8gb',
    CPU_8_MEM_16GB: 's-8vcpu-16gb'
} as const;
export type DigitalOceanDropletSize = typeof DigitalOceanDropletSize[keyof typeof DigitalOceanDropletSize];

/**
 * String union of a selection of public droplet distro images and some custom
 * images existing on our account. Source: https://slugs.do-api.dev/
 */
export const DigitalOceanDistroImage = {
    CentOS7: 'centos-7-x64',
    CentOS8: 'centos-8-x64',
    Debian10: 'debian-10-x64',
    Debian11: 'debian-11-x64',
    Ubuntu18: 'ubuntu-18-04-x64',
    Ubuntu20: 'ubuntu-20-04-x64',
    // This is a custom DigitalOcean image that exists on our account.
    // The image is built from al2_20211005.0-x86_64.
    // Find the image ID of custom images using: doctl compute image list-user
    AmazonLinux2: 95598425
} as const;
export type DigitalOceanDistroImage = typeof DigitalOceanDistroImage[keyof typeof DigitalOceanDistroImage];

export function getDOImageName(image: DigitalOceanDistroImage) {
    switch (image) {
    case DigitalOceanDistroImage.CentOS7:
        return 'centos7';
    case DigitalOceanDistroImage.CentOS8:
        return 'centos8';
    case DigitalOceanDistroImage.Debian10:
        return 'debian10';
    case DigitalOceanDistroImage.Debian11:
        return 'debian11';
    case DigitalOceanDistroImage.Ubuntu18:
        return 'ubuntu18';
    case DigitalOceanDistroImage.Ubuntu20:
        return 'ubuntu20';
    case DigitalOceanDistroImage.AmazonLinux2:
        return 'al2';
    default:
        // Compile-time exhaustive check
        const _exhaustiveCheck: never = image;
        return _exhaustiveCheck;
    }
}

/**
 * Represents an SSM target hosted on a specific droplet
 */
export type DigitalOceanSSMTarget = {
    droplet: Droplet;
    ssmTarget: SsmTargetSummary;
};

/**
 * Parameters to create an SSM target hosted on a DigitalOcean droplet
 */
export type DigitalOceanSsmTargetParameters = {
    targetName: string;
    envId?: string;
    dropletParameters: CreateNewDropletParameters;
}

/**
 * Parameters to create a new DigitalOcean droplet
 */
export type CreateNewDropletParameters = {
    dropletName: string;
    dropletRegion: DigitalOceanRegion;
    dropletSize: DigitalOceanDropletSize;
    dropletImage: DigitalOceanDistroImage;
    dropletTags?: string[];
    userDataScript?: string;
}

/**
 * This error is thrown when the SSM target status poller sees that the watched
 * target has entered the "Error" state, or if the poller times out before the
 * target can reach "Online"
 */
export class SsmTargetStatusPollError extends Error {
    constructor(
        public ssmTarget: SsmTargetSummary,
        message?: string) {
        super(message);
        this.name = 'SsmTargetStatusPollError';
    }
}