import { createHash } from 'node:crypto';
import {
  aiGenerationContracts,
  aiProviderModelExecutionSchema,
  type AiAdapter,
  type AiChatImplementation,
  type AiProviderModelExecution,
  type AiReadinessReason,
  type AiUpstreamFormat,
} from '@thesis-ledger/schemas';
import type {
  AiProviderCapabilityRevocation,
  AiProviderExecutionRouteInput,
} from './ai-provider.contracts.js';
import {
  AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
  resolveAiSdkProviderImplementation,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';

const SDK_VERSION = '7.0.107';
const ADAPTER_VERSIONS: Record<AiAdapter, string> = {
  openrouter: '3.0.0',
  'openai-compatible': '3.0.45',
  'openai-compatible-chat': '3.0.53',
  'openai-chat': '4.0.71',
  'openai-responses': '4.0.71',
  'anthropic-messages': '4.0.58',
};

export type AiProviderRouteSnapshot = {
  providerId: string;
  baseUrl: string;
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  adapter: AiAdapter | null;
  models: readonly string[];
  route: AiProviderExecutionRouteInput;
  enabled: boolean;
  health: string;
  credentialFingerprint: string | null;
  revocations: readonly AiProviderCapabilityRevocation[];
};

export type AiProviderReadinessRequest = {
  budgetAuthorized: boolean;
};

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

const normalizedBaseUrl = (baseUrl: string) => {
  try {
    const parsed = new URL(baseUrl);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/u, '');
  } catch {
    return null;
  }
};

const knownContract = (route: AiProviderExecutionRouteInput) =>
  Object.values(aiGenerationContracts).some(
    ({ ref }) => ref.id === route.contract.id && ref.version === route.contract.version,
  );

const adapterEvidence = (adapter: AiAdapter | null, route: AiProviderExecutionRouteInput) => {
  if (!adapter || !knownContract(route)) return null;
  const adapterVersion = ADAPTER_VERSIONS[adapter];
  return {
    adapter,
    adapterVersion,
    sdkVersion: SDK_VERSION,
    contract: route.contract,
    mode: route.mode,
    releaseFingerprint: fingerprint({
      sdkVersion: SDK_VERSION,
      adapter,
      adapterVersion,
      contract: route.contract,
      mode: route.mode,
    }),
  };
};

const routeAllowed = (snapshot: AiProviderRouteSnapshot, baseUrl: string | null) => {
  if (snapshot.route.allowedUpstreams.length === 0) return true;
  if (snapshot.compatibilityExtensionProfile === AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1)
    return true;
  if (!baseUrl) return false;
  const endpoint = new URL(baseUrl);
  return snapshot.route.allowedUpstreams.some((allowed) => {
    try {
      const candidate = new URL(allowed);
      return candidate.origin === endpoint.origin;
    } catch {
      return allowed.toLowerCase() === endpoint.hostname.toLowerCase();
    }
  });
};

const freeEvidenceRef = (route: AiProviderExecutionRouteInput) => {
  const evidence = route.freeEvidence;
  if (!evidence) return null;
  return `${evidence.source}:${evidence.sourceRef}@${evidence.sourceVersion}`;
};

export const configurationFingerprint = (snapshot: AiProviderRouteSnapshot) =>
  fingerprint({
    providerId: snapshot.providerId,
    baseUrl: normalizedBaseUrl(snapshot.baseUrl),
    upstreamFormat: snapshot.upstreamFormat,
    chatImplementation: snapshot.chatImplementation ?? null,
    sdkProviderImplementation: resolveAiSdkProviderImplementation({
      upstreamFormat: snapshot.upstreamFormat,
      ...(snapshot.chatImplementation === undefined
        ? {}
        : { chatImplementation: snapshot.chatImplementation }),
    }),
    compatibilityExtensionProfile: snapshot.compatibilityExtensionProfile ?? null,
    adapter: snapshot.adapter,
    model: snapshot.route.model,
    mode: snapshot.route.mode,
    contract: snapshot.route.contract,
    declaration: snapshot.route.capabilityDeclaration,
    allowedUpstreams: [...snapshot.route.allowedUpstreams].sort(),
    firstOutputTimeoutMs: snapshot.route.firstOutputTimeoutMs ?? null,
    outputIdleTimeoutMs: snapshot.route.outputIdleTimeoutMs ?? null,
    freeEvidence: snapshot.route.freeEvidence,
    credentialFingerprint: snapshot.credentialFingerprint,
  });

export const evaluateAiProviderReadiness = (
  snapshot: AiProviderRouteSnapshot,
  request: AiProviderReadinessRequest,
  evaluatedAt = new Date(),
): AiProviderModelExecution => {
  const baseUrl = normalizedBaseUrl(snapshot.baseUrl);
  const evidence = adapterEvidence(snapshot.adapter, snapshot.route);
  const configuration = configurationFingerprint(snapshot);
  const reasons: AiReadinessReason[] = [];
  if (
    !baseUrl ||
    !snapshot.adapter ||
    !snapshot.models.includes(snapshot.route.model) ||
    !snapshot.credentialFingerprint
  )
    reasons.push('configuration_invalid');
  if (!snapshot.enabled) reasons.push('provider_disabled');
  if (snapshot.health === 'down') reasons.push('provider_down');
  if (!snapshot.route.capabilityDeclaration) reasons.push('capability_declaration_missing');
  if (!evidence) reasons.push('adapter_contract_evidence_missing');
  if (!routeAllowed(snapshot, baseUrl)) reasons.push('route_not_allowed');
  if (!snapshot.route.freeEvidence && !request.budgetAuthorized)
    reasons.push('budget_not_authorized');
  if (
    snapshot.revocations.some(
      (revocation) =>
        revocation.model === snapshot.route.model &&
        revocation.mode === snapshot.route.mode &&
        revocation.contract.id === snapshot.route.contract.id &&
        revocation.contract.version === snapshot.route.contract.version &&
        revocation.configurationFingerprint === configuration,
    )
  )
    reasons.push('capability_revoked');

  const uniqueReasons = [...new Set(reasons)];
  return aiProviderModelExecutionSchema.parse({
    model: snapshot.route.model,
    adapter: snapshot.adapter ?? 'openai-compatible',
    ...(snapshot.compatibilityExtensionProfile === undefined
      ? {}
      : { compatibilityExtensionProfile: snapshot.compatibilityExtensionProfile }),
    mode: snapshot.route.mode,
    contract: snapshot.route.contract,
    capabilityDeclaration: snapshot.route.capabilityDeclaration,
    adapterEvidence: evidence,
    readiness: {
      state: uniqueReasons.length === 0 ? 'ready' : 'blocked',
      reasons: uniqueReasons,
      configurationFingerprint: configuration,
      evaluatedAt: evaluatedAt.toISOString(),
    },
    liveValidation: { status: 'not_run', checkedAt: null, requestId: null },
    allowedUpstreams: snapshot.route.allowedUpstreams,
    ...(snapshot.route.firstOutputTimeoutMs === undefined
      ? {}
      : { firstOutputTimeoutMs: snapshot.route.firstOutputTimeoutMs }),
    ...(snapshot.route.outputIdleTimeoutMs === undefined
      ? {}
      : { outputIdleTimeoutMs: snapshot.route.outputIdleTimeoutMs }),
    freeEvidenceRef: freeEvidenceRef(snapshot.route),
  });
};

export const aiAdapterRelease = {
  sdkVersion: SDK_VERSION,
  adapterVersions: ADAPTER_VERSIONS,
} as const;
