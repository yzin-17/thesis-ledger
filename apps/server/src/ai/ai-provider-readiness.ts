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
  adapterSupportsGenerationMode,
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
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
  enabled: boolean;
  health: string;
  credentialFingerprint: string | null;
  authMode?: 'api_key' | 'none';
  liveValidation?: { status: 'passed'; checkedAt: string; requestId: string };
  revocations: readonly AiProviderCapabilityRevocation[];
};

export const DEFAULT_AI_FIRST_OUTPUT_TIMEOUT_MS = 30_000;
export const DEFAULT_AI_OUTPUT_IDLE_TIMEOUT_MS = 30_000;

export type AiRouteTimeoutResolution = {
  firstOutputTimeoutMs: number;
  outputIdleTimeoutMs: number;
  firstOutputTimeoutSource: 'route' | 'provider' | 'system';
  outputIdleTimeoutSource: 'route' | 'provider' | 'system';
};

const timeoutSource = (
  routeValue: number | undefined,
  providerValue: number | undefined,
): 'route' | 'provider' | 'system' => {
  if (routeValue !== undefined) return 'route';
  if (providerValue !== undefined) return 'provider';
  return 'system';
};

export const resolveAiRouteTimeouts = (
  snapshot: Pick<AiProviderRouteSnapshot, 'route' | 'firstOutputTimeoutMs' | 'outputIdleTimeoutMs'>,
): AiRouteTimeoutResolution => ({
  firstOutputTimeoutMs:
    snapshot.route.firstOutputTimeoutMs ??
    snapshot.firstOutputTimeoutMs ??
    DEFAULT_AI_FIRST_OUTPUT_TIMEOUT_MS,
  outputIdleTimeoutMs:
    snapshot.route.outputIdleTimeoutMs ??
    snapshot.outputIdleTimeoutMs ??
    DEFAULT_AI_OUTPUT_IDLE_TIMEOUT_MS,
  firstOutputTimeoutSource: timeoutSource(
    snapshot.route.firstOutputTimeoutMs,
    snapshot.firstOutputTimeoutMs,
  ),
  outputIdleTimeoutSource: timeoutSource(
    snapshot.route.outputIdleTimeoutMs,
    snapshot.outputIdleTimeoutMs,
  ),
});

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
  if (!adapter || !knownContract(route) || !adapterSupportsGenerationMode(adapter, route.mode))
    return null;
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

const hasValidCurrency = (currency: string | undefined) =>
  typeof currency === 'string' && /^[A-Z]{3}$/u.test(currency.trim().toUpperCase());

export const hasUserConfiguredZeroCost = (snapshot: AiProviderRouteSnapshot) =>
  snapshot.costPer1kInput === 0 &&
  snapshot.costPer1kOutput === 0 &&
  hasValidCurrency(snapshot.costCurrency);

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
    firstOutputTimeoutMs: snapshot.route.firstOutputTimeoutMs ?? null,
    outputIdleTimeoutMs: snapshot.route.outputIdleTimeoutMs ?? null,
    providerFirstOutputTimeoutMs: snapshot.firstOutputTimeoutMs ?? null,
    providerOutputIdleTimeoutMs: snapshot.outputIdleTimeoutMs ?? null,
    credentialFingerprint: snapshot.credentialFingerprint,
    authMode: snapshot.authMode ?? 'api_key',
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
    (snapshot.authMode !== 'none' && !snapshot.credentialFingerprint)
  )
    reasons.push('configuration_invalid');
  if (!snapshot.enabled) reasons.push('provider_disabled');
  if (snapshot.health === 'down') reasons.push('provider_down');
  if (!evidence) reasons.push('adapter_contract_evidence_missing');
  if (!request.budgetAuthorized && !hasUserConfiguredZeroCost(snapshot))
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
  const timeouts = resolveAiRouteTimeouts(snapshot);
  return aiProviderModelExecutionSchema.parse({
    model: snapshot.route.model,
    adapter: snapshot.adapter ?? 'openai-compatible',
    ...(snapshot.compatibilityExtensionProfile === undefined
      ? {}
      : { compatibilityExtensionProfile: snapshot.compatibilityExtensionProfile }),
    mode: snapshot.route.mode,
    contract: snapshot.route.contract,
    adapterEvidence: evidence,
    readiness: {
      state: uniqueReasons.length === 0 ? 'ready' : 'blocked',
      reasons: uniqueReasons,
      configurationFingerprint: configuration,
      evaluatedAt: evaluatedAt.toISOString(),
    },
    liveValidation: snapshot.liveValidation ?? {
      status: 'not_run',
      checkedAt: null,
      requestId: null,
    },
    firstOutputTimeoutMs: timeouts.firstOutputTimeoutMs,
    outputIdleTimeoutMs: timeouts.outputIdleTimeoutMs,
    firstOutputTimeoutSource: timeouts.firstOutputTimeoutSource,
    outputIdleTimeoutSource: timeouts.outputIdleTimeoutSource,
  });
};

export const aiAdapterRelease = {
  sdkVersion: SDK_VERSION,
  adapterVersions: ADAPTER_VERSIONS,
} as const;
