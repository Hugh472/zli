import { KubernetesPolicyCreateRequest } from '../../../webshell-common-ts/http/v2/policy/kubernetes/requests/kubernetes-policy-create.requests';
import { KubernetesPolicyUpdateRequest } from '../../../webshell-common-ts/http/v2/policy/kubernetes/requests/kubernetes-policy-update.requests';
import { KubernetesPolicySummary } from '../../../webshell-common-ts/http/v2/policy/kubernetes/types/kubernetes-policy-summary.types';
import { OrganizationControlsPolicyCreateRequest } from '../../../webshell-common-ts/http/v2/policy/organization-controls/requests/organization-controls-policy-create.requests';
import { OrganizationControlsPolicyUpdateRequest } from '../../../webshell-common-ts/http/v2/policy/organization-controls/requests/organization-controls-policy-update.requests';
import { OrganizationControlsPolicySummary } from '../../../webshell-common-ts/http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { ProxyPolicySummary } from '../../../webshell-common-ts/http/v2/policy/proxy/types/proxy-policy-summary.types';
import { ProxyPolicyCreateRequest } from '../../../webshell-common-ts/http/v2/policy/proxy/requests/proxy-policy-create.requests';
import { SessionRecordingPolicyCreateRequest } from '../../../webshell-common-ts/http/v2/policy/session-recording/requests/session-recording-create.requests';
import { SessionRecordingPolicyUpdateRequest } from '../../../webshell-common-ts/http/v2/policy/session-recording/requests/session-recording-policy-update.requests';
import { SessionRecordingPolicySummary } from '../../../webshell-common-ts/http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicyCreateRequest } from '../../../webshell-common-ts/http/v2/policy/target-connect/requests/target-connect-policy-create.requests';
import { TargetConnectPolicyUpdateRequest } from '../../../webshell-common-ts/http/v2/policy/target-connect/requests/target-connect-policy-update.requests';
import { TargetConnectPolicySummary } from '../../../webshell-common-ts/http/v2/policy/target-connect/types/target-connect-policy-summary.types';

import { ConfigService } from '../../services/config/config.service';
import { HttpService } from '../../services/http/http.service';
import { Logger } from '../../services/logger/logger.service';

const KUBE: string = 'kubernetes';
const ORG: string = 'organization-controls';
const SESSION: string = 'session-recording';
const TARGET: string = 'target-connect';
const PROXY: string = 'proxy';

export class PolicyHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/policies', logger);
    }

    public ListKubernetesPolicies(subjects?: string, groups?: string): Promise<KubernetesPolicySummary[]>
    {
        return this.Get(KUBE, {subjects: subjects, groups: groups });
    }

    public ListOrganizationControlPolicies(): Promise<OrganizationControlsPolicySummary[]>
    {
        return this.Get(ORG);
    }

    public ListProxyPolicies(): Promise<ProxyPolicySummary[]>
    {
        return this.Get(PROXY);
    }

    public ListSessionRecordingPolicies(): Promise<SessionRecordingPolicySummary[]>
    {
        return this.Get(SESSION);
    }

    public ListTargetConnectPolicies(): Promise<TargetConnectPolicySummary[]>
    {
        return this.Get(TARGET);
    }


    public EditKubernetesPolicy(
        policy: KubernetesPolicySummary
    ): Promise<KubernetesPolicySummary> {
        const request: KubernetesPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            clusters: policy.clusters,
            clusterUsers: policy.clusterUsers,
            clusterGroups: policy.clusterGroups,
        };
        return this.Patch(`${KUBE}/${policy.id}` , request);
    }

    public EditOrganizationControlPolicy(
        policy: OrganizationControlsPolicySummary
    ): Promise<OrganizationControlsPolicySummary> {
        const request: OrganizationControlsPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            mfaEnabled: policy.mfaEnabled
        };
        return this.Patch(`${ORG}/${policy.id}`, request);
    }

    public EditSessionRecordingPolicy(
        policy: SessionRecordingPolicySummary
    ): Promise<SessionRecordingPolicySummary> {
        const request: SessionRecordingPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            recordInput: policy.recordInput
        };
        return this.Patch(`${SESSION}/${policy.id}`, request);
    }

    public EditTargetConnectPolicy(
        policy: TargetConnectPolicySummary
    ): Promise<TargetConnectPolicySummary> {
        const request: TargetConnectPolicyUpdateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            targets: policy.targets,
            targetUsers: policy.targetUsers,
            verbs: policy.verbs
        };
        return this.Patch(`${TARGET}/${policy.id}`, request);
    }


    public AddKubernetesPolicy(request: KubernetesPolicyCreateRequest): Promise<KubernetesPolicySummary> {
        return this.Post(KUBE, request);
    }

    public AddOrganizationControlPolicy(request: OrganizationControlsPolicyCreateRequest): Promise<OrganizationControlsPolicySummary> {
        return this.Post(ORG, request);
    }

    public AddSessionRecordingPolicy(request: SessionRecordingPolicyCreateRequest): Promise<SessionRecordingPolicySummary> {
        return this.Post(SESSION, request);
    }

    public AddTargetConnectPolicy(request: TargetConnectPolicyCreateRequest): Promise<TargetConnectPolicySummary> {
        return this.Post(TARGET, request);
    }

    public AddProxyPolicy(request: ProxyPolicyCreateRequest): Promise<ProxyPolicySummary> {
        return this.Post(PROXY, request);
    }

    public DeleteKubernetesPolicy(policyId: string): Promise<void> {
        return this.Delete(`${KUBE}/${policyId}`);
    }

    public DeleteOrganizationControlsPolicy(policyId: string): Promise<void> {
        return this.Delete(`${ORG}/${policyId}`);
    }

    public DeleteSessionRecordingPolicy(policyId: string): Promise<void> {
        return this.Delete(`${SESSION}/${policyId}`);
    }

    public DeleteTargetConnectPolicy(policyId: string): Promise<void> {
        return this.Delete(`${TARGET}/${policyId}`);
    }

    public DeleteProxyPolicy(policyId: string): Promise<void> {
        return this.Delete(`${PROXY}/${policyId}`);
    }
}