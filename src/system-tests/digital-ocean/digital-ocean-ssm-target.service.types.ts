import { Droplet } from 'digitalocean-js';
import { SsmTargetSummary } from '../../services/v1/ssm-target/ssm-target.types';
import { DigitalOceanDropletSize, DigitalOceanRegion } from './digital-ocean.types';

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

export function getPackageManagerType(image: DigitalOceanDistroImage) : 'yum' | 'apt' {
    switch (image) {
    case DigitalOceanDistroImage.CentOS7:
    case DigitalOceanDistroImage.CentOS8:
    case DigitalOceanDistroImage.AmazonLinux2:
        return 'yum';
    case DigitalOceanDistroImage.Debian10:
    case DigitalOceanDistroImage.Debian11:
    case DigitalOceanDistroImage.Ubuntu18:
    case DigitalOceanDistroImage.Ubuntu20:
        return 'apt';
    default:
        // Compile-time exhaustive check
        const _exhaustiveCheck: never = image;
        return _exhaustiveCheck;
    }
}

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