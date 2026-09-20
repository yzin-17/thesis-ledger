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

const lines = (value: string) =>
  value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);

export const newAiProviderExecutionRouteDraft = (model = ''): AiProviderExecutionRouteDraft => ({
  key: nextRouteKey(),
  model,
  mode: 'json_validated',
  contractId: 'research',
  declarationSource: 'none',
  declarationSourceRef: '',
  declarationSourceVersion: '',
  declaredAt: new Date().toISOString(),
  declaredBy: '',
  allowedUpstreamsText: '',
  firstOutputTimeoutMs: '',
  outputIdleTimeoutMs: '',
  freeEvidenceSource: 'none',
  freeEvidenceSourceRef: '',
  freeEvidenceSourceVersion: '',
});

export const aiProviderExecutionRouteDraftFromConfig = (
  route: AiProviderExecutionRouteConfig,
): AiProviderExecutionRouteDraft => ({
  key: nextRouteKey(),
  model: route.model,
  mode: route.mode,
  contractId: route.contract.id,
  declarationSource: route.capabilityDeclaration?.source ?? 'none',
  declarationSourceRef: route.capabilityDeclaration?.sourceRef ?? '',
  declarationSourceVersion: route.capabilityDeclaration?.sourceVersion ?? '',
  declaredAt: route.capabilityDeclaration?.declaredAt ?? new Date().toISOString(),
  declaredBy: route.capabilityDeclaration?.declaredBy ?? '',
  allowedUpstreamsText: route.allowedUpstreams.join('\n'),
  firstOutputTimeoutMs: route.firstOutputTimeoutMs?.toString() ?? '',
  outputIdleTimeoutMs: route.outputIdleTimeoutMs?.toString() ?? '',
  freeEvidenceSource: route.freeEvidence?.source ?? 'none',
  freeEvidenceSourceRef: route.freeEvidence?.sourceRef ?? '',
  freeEvidenceSourceVersion: route.freeEvidence?.sourceVersion ?? '',
});

export const aiProviderExecutionRouteInputFromDraft = (
  draft: AiProviderExecutionRouteDraft,
): AiProviderExecutionRouteConfig => {
  const firstOutputTimeoutMs = optionalNumber(draft.firstOutputTimeoutMs);
  const outputIdleTimeoutMs = optionalNumber(draft.outputIdleTimeoutMs);
  let capabilityDeclaration: AiProviderExecutionRouteConfig['capabilityDeclaration'] = null;
  if (draft.declarationSource !== 'none') {
    let declaredBy: string | null = null;
    if (draft.declarationSource === 'manual') declaredBy = draft.declaredBy.trim() || null;
    capabilityDeclaration = {
      source: draft.declarationSource,
      sourceRef: draft.declarationSourceRef.trim(),
      sourceVersion: draft.declarationSourceVersion.trim(),
      declaredAt: draft.declaredAt,
      declaredBy,
    };
  }
  const freeEvidence =
    draft.freeEvidenceSource === 'none'
      ? null
      : {
          source: draft.freeEvidenceSource,
          sourceRef: draft.freeEvidenceSourceRef.trim(),
          sourceVersion: draft.freeEvidenceSourceVersion.trim(),
        };
  return {
    model: draft.model.trim(),
    mode: draft.mode,
    contract: contractRefs[draft.contractId],
    capabilityDeclaration,
    allowedUpstreams: lines(draft.allowedUpstreamsText),
    ...(firstOutputTimeoutMs === undefined ? {} : { firstOutputTimeoutMs }),
    ...(outputIdleTimeoutMs === undefined ? {} : { outputIdleTimeoutMs }),
    freeEvidence,
  };
};

export const aiReadinessReasonLabels: Record<
  AiProviderModelExecution['readiness']['reasons'][number],
  string
> = {
  configuration_invalid: '配置不完整',
  provider_disabled: 'Provider 已停用',
  provider_down: '连接状态不可用',
  capability_declaration_missing: '缺少能力声明',
  adapter_contract_evidence_missing: '缺少本地 adapter 契约证据',
  route_not_allowed: '上游路由不在允许范围',
  budget_not_authorized: '费用预算未授权或缺少免费依据',
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
