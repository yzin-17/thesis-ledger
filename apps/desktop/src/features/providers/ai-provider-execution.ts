import {
  AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION,
  AI_RESEARCH_GENERATION_CONTRACT_VERSION,
  AI_STRATEGY_DISCOVERY_CONTRACT_VERSION,
  type AiGenerationContractRef,
  type AiProviderModelExecution,
} from '@thesis-ledger/schemas';
import type {
  AiProviderExecutionRouteConfig,
  AiProviderExecutionRouteDraft,
} from './providers.types.js';

export const aiContractOptions: Array<{
  value: AiGenerationContractRef['id'];
  label: string;
}> = [
  { value: 'research', label: '研究报告' },
  { value: 'parameter_optimization', label: '参数优化' },
  { value: 'strategy_discovery', label: '策略发现' },
];

const contractRefs: Record<AiGenerationContractRef['id'], AiGenerationContractRef> = {
  research: { id: 'research', version: AI_RESEARCH_GENERATION_CONTRACT_VERSION },
  parameter_optimization: {
    id: 'parameter_optimization',
    version: AI_PARAMETER_OPTIMIZATION_CONTRACT_VERSION,
  },
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
  mode: 'json_validated',
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
  model: route.model,
  mode: route.mode,
  enabled: route.enabled !== false,
  modeOverridden: route.modeOverridden ?? true,
  contractId: route.contract.id,
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
    mode: draft.mode,
    ...(draft.enabled ? {} : { enabled: false }),
    ...(draft.modeOverridden ? { modeOverridden: true } : {}),
    contract: contractRefs[draft.contractId],
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

export const aiReadinessReasonLabels: Record<
  AiProviderModelExecution['readiness']['reasons'][number],
  string
> = {
  configuration_invalid: '配置不完整',
  provider_disabled: 'Provider 已停用',
  provider_down: '连接状态不可用',
  adapter_contract_evidence_missing: '缺少本地 adapter 契约证据',
  budget_not_authorized: '费用预算未授权',
  capability_revoked: '该配置组合的能力已撤销',
};

export const aiReadinessReasonLabel = (
  reason: AiProviderModelExecution['readiness']['reasons'][number],
) => aiReadinessReasonLabels[reason];

export const aiExecutionReadinessLabel = (routes: AiProviderModelExecution[] | undefined) => {
  if (!routes || routes.length === 0) return '未配置执行路由';
  const ready = routes.filter((route) => route.readiness.state === 'ready').length;
  if (ready === routes.length) return `接入就绪 ${ready}/${routes.length}`;
  return `接入阻断 ${routes.length - ready}/${routes.length}`;
};

export const aiLiveValidationLabel = (routes: AiProviderModelExecution[] | undefined) => {
  if (!routes || routes.length === 0) return '真实验收未执行';
  if (routes.some((route) => route.liveValidation.status === 'failed')) return '真实验收失败';
  if (routes.every((route) => route.liveValidation.status === 'passed')) return '真实验收通过';
  return '真实验收未执行';
};
