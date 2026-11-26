import {
  AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION,
  researchGenerationV2Contract,
  AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
  aiGenerationContracts,
  aiGenerationContractRefSchema,
  type AiGenerationContractRef,
} from '@thesis-ledger/schemas';
import { aiProviderPurposeOptions } from '@thesis-ledger/domain';
import type {
  AiProviderExecutionRouteConfig,
  AiProviderExecutionRouteDraft,
} from './providers.types.js';

export const aiContractOptions: Array<{
  value: AiGenerationContractRef['id'];
  label: string;
}> = [...aiProviderPurposeOptions];

const contractRefs: Record<AiGenerationContractRef['id'], AiGenerationContractRef> = {
  strategy_authoring_analysis: aiGenerationContracts.authoringAnalysis.ref,
  strategy_authoring_generation: aiGenerationContracts.authoringGeneration.ref,
  strategy_authoring_modification: aiGenerationContracts.authoringModification.ref,
  research: researchGenerationV2Contract.ref,
  parameter_optimization: {
    id: 'parameter_optimization',
    version: AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION,
  },
  arena_decision: aiGenerationContracts.arenaDecision.ref,
  arena_live_research: aiGenerationContracts.arenaLiveResearch.ref,
  strategy_discovery: {
    id: 'strategy_discovery',
    version: AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
  },
};

let routeSequence = 0;
const nextRouteKey = () => {
  routeSequence += 1;
  return `execution-route-${routeSequence}`;
};

const optionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const newAiProviderExecutionRouteDraft = (model = ''): AiProviderExecutionRouteDraft => ({
  key: nextRouteKey(),
  model,
  mode: 'native_schema',
  outputPolicy: 'auto',
  enabled: true,
  modeOverridden: false,
  contractId: 'research',
  firstOutputTimeoutMs: '',
  outputIdleTimeoutMs: '',
});

export const aiProviderExecutionRouteDraftFromConfig = (
  route: AiProviderExecutionRouteConfig,
): AiProviderExecutionRouteDraft => ({
  key: nextRouteKey(),
  ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
  ...(route.reasoningEnabled === undefined ? {} : { reasoningEnabled: route.reasoningEnabled }),
  model: route.model,
  mode: route.mode,
  outputPolicy: route.outputPolicy ?? 'manual',
  enabled: route.enabled !== false,
  modeOverridden: route.modeOverridden ?? true,
  contractId: route.contract.id,
  contractVersion: route.contract.version,
  firstOutputTimeoutMs: route.firstOutputTimeoutMs?.toString() ?? '',
  outputIdleTimeoutMs: route.outputIdleTimeoutMs?.toString() ?? '',
});

export const aiProviderExecutionRouteInputFromDraft = (
  draft: AiProviderExecutionRouteDraft,
): AiProviderExecutionRouteConfig => {
  const firstOutputTimeoutMs = optionalNumber(draft.firstOutputTimeoutMs);
  const outputIdleTimeoutMs = optionalNumber(draft.outputIdleTimeoutMs);
  return {
    model: draft.model.trim(),
    ...(draft.reasoningEffort === undefined ? {} : { reasoningEffort: draft.reasoningEffort }),
    ...(draft.reasoningEnabled === undefined ? {} : { reasoningEnabled: draft.reasoningEnabled }),
    mode: draft.mode,
    outputPolicy: draft.outputPolicy ?? 'manual',
    ...(draft.enabled ? {} : { enabled: false }),
    modeOverridden: draft.modeOverridden,
    contract:
      draft.contractVersion === undefined
        ? contractRefs[draft.contractId]
        : aiGenerationContractRefSchema.parse({
            id: draft.contractId,
            version: draft.contractVersion,
          }),
    ...(firstOutputTimeoutMs === undefined ? {} : { firstOutputTimeoutMs }),
    ...(outputIdleTimeoutMs === undefined ? {} : { outputIdleTimeoutMs }),
  };
};

export type AiProviderExecutionModeState =
  | { kind: 'none' }
  | { kind: 'shared'; mode: AiProviderExecutionRouteDraft['mode'] }
  | { kind: 'mixed' };

export const aiProviderExecutionModeState = (
  routes: readonly AiProviderExecutionRouteDraft[],
): AiProviderExecutionModeState => {
  if (routes.length === 0) return { kind: 'none' };
  const first = routes[0]?.mode;
  if (routes.every((route) => route.mode === first) && first !== undefined)
    return { kind: 'shared', mode: first };
  return { kind: 'mixed' };
};

export const nextActivePurposeAfterRemoval = (
  routes: readonly AiProviderExecutionRouteDraft[],
  removedKey: string,
) => {
  const routeIndex = routes.findIndex((route) => route.key === removedKey);
  const remainingRoutes = routes.filter((route) => route.key !== removedKey);
  return (
    remainingRoutes[routeIndex]?.contractId ??
    remainingRoutes[routeIndex - 1]?.contractId ??
    remainingRoutes[0]?.contractId
  );
};

export const aiProviderExecutionTimeoutLabel = (
  value: string,
  scope: 'route' | 'provider' = 'route',
) => {
  if (value.trim()) return '当前用途覆盖';
  return scope === 'provider' ? '系统默认' : '继承 Provider 默认；未设置时使用系统默认';
};
