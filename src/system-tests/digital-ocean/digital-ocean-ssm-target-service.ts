import { Retrier } from '@jsier/retrier';
import { DigitalOcean, Droplet } from 'digitalocean-js';
import { ConfigService } from '../../services/config/config.service';
import { Logger } from '../../services/logger/logger.service';
import { BzeroTargetStatusPollError, CreateNewDropletParameters, DigitalOceanBZeroTarget, DigitalOceanSSMTarget, DigitalOceanSsmTargetParameters, SsmTargetStatusPollError } from './digital-ocean-ssm-target.service.types';
import axios from 'axios';
import { checkAllSettledPromise } from '../tests/utils/utils';
import { SsmTargetHttpService } from '../../http-services/targets/ssm/ssm-target.http-services';
import { SsmTargetSummary } from '../../../webshell-common-ts/http/v2/target/ssm/types/ssm-target-summary.types';
import { TargetStatus } from '../../../webshell-common-ts/http/v2/target/types/targetStatus.types';
import { BzeroAgentSummary } from '../../../webshell-common-ts/http/v2/target/bzero/types/bzero-agent-summary.types';
import { BzeroAgentService } from '../../http-services/bzero-agent/bzero-agent.http-service';

export class DigitalOceanSSMTargetService {
    private doClient: DigitalOcean;
    private ssmTargetHttpService: SsmTargetHttpService;
    private bzeroTargetHttpService: BzeroAgentService;

    constructor(
        apiToken: string,
        private configService: ConfigService,
        private logger: Logger
    ) {
        this.doClient = new DigitalOcean(apiToken);
        this.ssmTargetHttpService = new SsmTargetHttpService(this.configService, this.logger);
        this.bzeroTargetHttpService = new BzeroAgentService(this.configService, this.logger);
    }

    /**
     * Create a DigitalOcean droplet to host a new SSM target
     * @param autoDiscoveryScript The autodiscovery script which is passed in as
     * a User-Data script during droplet creation
     * @returns Information about the created droplet
     */
    public async createDigitalOceanSSMTarget(parameters: DigitalOceanSsmTargetParameters, autoDiscoveryScript: string): Promise<Droplet> {
        // Create the droplet
        let droplet = await this.createNewDroplet({ ...parameters.dropletParameters, userDataScript: autoDiscoveryScript });

        // Poll until DigitalOcean says the droplet is online / active
        droplet = await this.pollDropletUntilActive(droplet.id);

        return droplet;
    }

    /**
     * Create a DigitalOcean droplet to host a new bzero target
     * @returns Information about the created droplet
     */
    public async createDigitalOceanBzeroTarget(parameters: DigitalOceanSsmTargetParameters): Promise<Droplet> {
        // Create the droplet
        let droplet = await this.createNewDroplet({ ...parameters.dropletParameters });

        // Poll until DigitalOcean says the droplet is online / active
        droplet = await this.pollDropletUntilActive(droplet.id);

        return droplet;
    }

    /**
     * Cleans up a DigitalOcean SSM target by deleting both the SSM target and
     * droplet
     * @param doTarget The DigitalOcean SSM target to clean up
     * @returns A promise that represents the results of deleting the droplet
     * and SSM target concurrently
     */
    public async deleteDigitalOceanTarget(
        doTarget: DigitalOceanSSMTarget | DigitalOceanBZeroTarget
    ): Promise<void> {
        const cleanupPromises = [];

        // Only delete droplet if it is set
        if (doTarget.droplet) {
            cleanupPromises.push(this.doClient.droplets.deleteDroplet(doTarget.droplet.id));
        }

        if(doTarget.type === 'ssm' ) {
            // Only delete SSM target if it is set
            if (doTarget.ssmTarget) {
                cleanupPromises.push(this.ssmTargetHttpService.DeleteSsmTarget(doTarget.ssmTarget.id));
            }
        } else if(doTarget.type === 'bzero') {
            // Only delete bzero target if it is set
            if (doTarget.bzeroTarget) {
                cleanupPromises.push(this.bzeroTargetHttpService.DeleteBzeroAgent(doTarget.bzeroTarget.id));
            }
        }

        await checkAllSettledPromise(Promise.allSettled(cleanupPromises));
    }

    /**
     * Polls the bastion until the SSM target is Online and the agent version is
     * known.
     * @param ssmTargetName The name of the target to poll
     * @returns Information about the target
     */
    public async pollSsmTargetOnline(ssmTargetName: string): Promise<SsmTargetSummary> {
        // Try 60 times with a delay of 10 seconds between each attempt (10 min).
        const retrier = new Retrier({
            limit: 60,
            delay: 1000 * 10,
            stopRetryingIf: (reason: any) => reason instanceof SsmTargetStatusPollError && reason.ssmTarget.status === TargetStatus.Error
        });

        // We don't know SSM target ID initially
        let ssmTargetId: string = '';
        return retrier.resolve(() => new Promise<SsmTargetSummary>(async (resolve, reject) => {
            const checkIsTargetOnline = (ssmTarget: SsmTargetSummary) => {
                if (ssmTarget.status === TargetStatus.Online && ssmTarget.agentVersion !== '') {
                    resolve(ssmTarget);
                } else {
                    throw new SsmTargetStatusPollError(ssmTarget, `Target ${ssmTarget.name} is not online. Has status: ${ssmTarget.status}`);
                }
            };
            try {
                if (ssmTargetId === '') {
                    // We don't know the SSM target ID yet, so we have to use
                    // the less efficient list API to learn about the ID
                    const targets = await this.ssmTargetHttpService.ListSsmTargets(false);
                    const foundTarget = targets.find(target => target.name === ssmTargetName);
                    if (foundTarget) {
                        ssmTargetId = foundTarget.id;
                        checkIsTargetOnline(foundTarget);
                    } else {
                        throw new Error(`Target with name ${ssmTargetName} does not exist`);
                    }
                } else {
                    // SSM target ID is known
                    const target = await this.ssmTargetHttpService.GetSsmTarget(ssmTargetId);
                    checkIsTargetOnline(target);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Polls the bastion until the SSM target is Online and the agent version is
     * known.
     * @param bzeroTargetName The name of the target to poll
     * @returns Information about the target
     */
    public async pollBZeroTargetOnline(bzeroTargetName: string): Promise<BzeroAgentSummary> {
        // Try 60 times with a delay of 10 seconds between each attempt (10 min).
        const retrier = new Retrier({
            limit: 60,
            delay: 1000 * 10,
            stopRetryingIf: (reason: any) => reason instanceof SsmTargetStatusPollError && reason.ssmTarget.status === TargetStatus.Error
        });

        // We don't know SSM target ID initially
        let bzeroTargetId: string = '';
        return retrier.resolve(() => new Promise<BzeroAgentSummary>(async (resolve, reject) => {
            const checkIsTargetOnline = (bzeroTarget: BzeroAgentSummary) => {
                if (bzeroTarget.status === TargetStatus.Online && bzeroTarget.agentVersion !== '') {
                    resolve(bzeroTarget);
                } else {
                    throw new BzeroTargetStatusPollError(bzeroTarget, `Target ${bzeroTarget.name} is not online. Has status: ${bzeroTarget.status}`);
                }
            };
            try {
                if (bzeroTargetId === '') {
                    // We don't know the SSM target ID yet, so we have to use
                    // the less efficient list API to learn about the ID
                    const bzeroTargets = await this.bzeroTargetHttpService.ListBzeroAgents();
                    const foundTarget = bzeroTargets.find(target => target.name === bzeroTargetName);
                    if (foundTarget) {
                        bzeroTargetId = foundTarget.id;
                        checkIsTargetOnline(foundTarget);
                    } else {
                        throw new Error(`Target with name ${bzeroTargetName} does not exist`);
                    }
                } else {
                    // SSM target ID is known
                    const target = await this.bzeroTargetHttpService.GetBzeroAgent(bzeroTargetId);
                    checkIsTargetOnline(target);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Polls DigitalOcean's GET droplet API until it says the provided droplet
     * has status == "active".
     * @param dropletId ID of droplet to query
     * @returns Droplet information after its status == "active"
     */
    private async pollDropletUntilActive(dropletId: number): Promise<Droplet> {
        // Try 60 times with a delay of 10 seconds between each attempt (10 min).
        const retrier = new Retrier({
            limit: 60,
            delay: 1000 * 10,
            stopRetryingIf: (reason: any) => axios.isAxiosError(reason)
        });

        return retrier.resolve(() => new Promise<Droplet>(async (resolve, reject) => {
            try {
                // A status string indicating the state of the Droplet instance. This may be "new", "active", "off", or "archive".
                // Source: https://docs.digitalocean.com/reference/api/api-reference/#operation/get_droplet
                const droplet = await this.doClient.droplets.getExistingDroplet(dropletId);
                if (droplet.status === 'active') {
                    resolve(droplet);
                } else {
                    throw new Error(`Droplet is not active. Has status: ${droplet.status}`);
                }
            } catch (error) {
                reject(error);
            }
        }));
    }

    /**
     * Create a new droplet
     * @param parameters Parameters to use when creating the droplet
     * @returns Information about the newly created droplet
     */
    private async createNewDroplet(
        parameters: CreateNewDropletParameters
    ): Promise<Droplet> {
        const request = {
            name: parameters.dropletName,
            region: parameters.dropletRegion,
            size: parameters.dropletSize,
            image: parameters.dropletImage,
            user_data: parameters.userDataScript,
            tags: parameters.dropletTags,
            // Key fingerprint for system-test SSH key that exists on our
            // account. This parameter is required when using custom images
            // (e.g. AL2). Find the key fingerprint of SSH keys using: doctl
            // compute ssh-key list
            ssh_keys: ['1d:24:d2:70:6d:28:b4:77:fa:94:5c:42:cf:7a:8f:03']
        };
        return this.doClient.droplets.createNewDroplet(request);
    }
}
