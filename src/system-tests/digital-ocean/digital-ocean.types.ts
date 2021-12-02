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