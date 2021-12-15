import { KubeTunnelPolicyCreateRequest } from 'http/v2/policy/kubernetes-tunnel/requests/kube-tunnel-policy-create.requests';
import { KubeTunnelPolicyUpdateRequest } from 'http/v2/policy/kubernetes-tunnel/requests/kube-tunnel-policy-update.requests';
import { KubeTunnelPolicySummary } from 'http/v2/policy/kubernetes-tunnel/types/kube-tunnel-policy-summary.types';
import { OrganizationControlsPolicyCreateRequest } from 'http/v2/policy/organization-controls/requests/organization-controls-policy-create.requests';
import { OrganizationControlsPolicyUpdateRequest } from 'http/v2/policy/organization-controls/requests/organization-controls-policy-update.requests';
import { OrganizationControlsPolicySummary } from 'http/v2/policy/organization-controls/types/organization-controls-policy-summary.types';
import { SessionRecordingPolicyCreateRequest } from 'http/v2/policy/session-recording/requests/session-recording-create.requests';
import { SessionRecordingPolicyUpdateRequest } from 'http/v2/policy/session-recording/requests/session-recording-policy-update.requests';
import { SessionRecordingPolicySummary } from 'http/v2/policy/session-recording/types/session-recording-policy-summary.types';
import { TargetConnectPolicyCreateRequest } from 'http/v2/policy/target-connect/requests/target-connect-policy-create.requests';
import { TargetConnectPolicyUpdateRequest } from 'http/v2/policy/target-connect/requests/target-connect-policy-update.requests';
import { TargetConnectPolicySummary } from 'http/v2/policy/target-connect/types/target-connect-policy-summary.types';
import { ConfigService } from 'services/config/config.service';
import { HttpService } from 'services/http/http.service';
import { Logger } from 'services/logger/logger.service';

const KUBE: string = 'kubernetes-tunnel';
const ORG: string = 'organization-controls';
const SESSION: string = 'session-recording';
const TARGET: string = 'target-connect';

export class PolicyHttpService extends HttpService
{
    constructor(configService: ConfigService, logger: Logger)
    {
        super(configService, 'api/v2/policies', logger);
    }

    public ListKubeTunnelPolicies(subjects?: string, groups?: string): Promise<KubeTunnelPolicySummary[]>
    {
        return this.Get(KUBE, {subjects: subjects, groups: groups });
    }

    public ListOrganizationControlPolicies(): Promise<OrganizationControlsPolicySummary[]>
    {
        return this.Get(ORG);
    }

    public ListSessionRecordingPolicies(): Promise<SessionRecordingPolicySummary[]>
    {
        return this.Get(SESSION);
    }

    public ListTargetConnectPolicies(): Promise<TargetConnectPolicySummary[]>
    {
        return this.Get(TARGET);
    }


    public EditKubeTunnelPolicy(
        policy: KubeTunnelPolicySummary
    ): Promise<KubeTunnelPolicySummary> {
        const request: KubeTunnelPolicyUpdateRequest = {
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


    public AddKubeTunnelPolicy(
        policy: KubeTunnelPolicySummary
    ): Promise<KubeTunnelPolicySummary> {
        const request: KubeTunnelPolicyCreateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            clusters: policy.clusters,
            clusterUsers: policy.clusterUsers,
            clusterGroups: policy.clusterGroups,
        };
        return this.Post(KUBE, request);
    }

    public AddOrganizationControlPolicy(
        policy: OrganizationControlsPolicySummary
    ): Promise<OrganizationControlsPolicySummary> {
        const request: OrganizationControlsPolicyCreateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            mfaEnabled: policy.mfaEnabled
        };
        return this.Post(ORG, request);
    }

    public AddSessionRecordingPolicy(
        policy: SessionRecordingPolicySummary
    ): Promise<SessionRecordingPolicySummary> {
        const request: SessionRecordingPolicyCreateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            recordInput: policy.recordInput
        };
        return this.Patch(`${SESSION}/${policy.id}`, request);
    }

    public AddTargetConnectPolicy(
        policy: TargetConnectPolicySummary
    ): Promise<TargetConnectPolicySummary> {
        const request: TargetConnectPolicyCreateRequest = {
            name: policy.name,
            subjects: policy.subjects,
            groups: policy.groups,
            description: policy.description,
            environments: policy.environments,
            targets: policy.targets,
            targetUsers: policy.targetUsers,
            verbs: policy.verbs
        };
        return this.Post(TARGET, request);
    }

    public DeleteKubeTunnelPolicy(policyId: string): Promise<void> {
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
}