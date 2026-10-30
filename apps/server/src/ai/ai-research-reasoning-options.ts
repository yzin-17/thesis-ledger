import { BadRequestException } from '@nestjs/common';
import type { AiGenerationContractRef, AiModelRequestOptions } from '@thesis-ledger/schemas';

type ReasoningOption = { reasoningEnabled?: boolean | undefined };
type RequestOptions = {
  requestOptions?: AiModelRequestOptions | undefined;
};
type Route = ReasoningOption & { model: string; contract: AiGenerationContractRef };
type Selection = {
  upstreamFormat: string;
  chatImplementation?: string | undefined;
  compatibilityExtensionProfile?: string | undefined;
};

export const isResearchV2Contract = (contract: AiGenerationContractRef) =>
  contract.id === 'research' && contract.version === 'research-generation-v2';

export const researchReasoningFields = (value: ReasoningOption = {}) =>
  value.reasoningEnabled === undefined ? {} : { reasoningEnabled: value.reasoningEnabled };

export const researchReasoningSelectionSupported = (selection: Selection) =>
  selection.upstreamFormat === 'chat-completions' &&
  selection.chatImplementation !== 'openai-native' &&
  selection.compatibilityExtensionProfile === 'openrouter-v1';

export const assertResearchReasoningRoutes = (selection: Selection, routes: readonly Route[]) => {
  if (routes.every((route) => route.reasoningEnabled === undefined)) return;
  if (
    !researchReasoningSelectionSupported(selection) ||
    routes.some(
      (route) => route.reasoningEnabled !== undefined && !isResearchV2Contract(route.contract),
    )
  )
    throw new BadRequestException('显式推理开关仅支持 OpenRouter 兼容扩展的研究 V2 用途');
};

/** 旧编辑器省略开关时保留同一用途的原值，显式 true/false 才改变它。 */
export const mergeResearchReasoningRoutes = <T extends Route>(
  input: readonly T[] | undefined,
  stored: readonly T[] | undefined,
): T[] | undefined => {
  if (!input) return stored ? [...stored] : undefined;
  return input.map((route) => {
    if (route.reasoningEnabled !== undefined) return route;
    const previous = stored?.find(
      (old) =>
        old.model === route.model &&
        old.contract.id === route.contract.id &&
        old.contract.version === route.contract.version,
    );
    return previous ? { ...route, ...researchReasoningFields(previous) } : route;
  });
};

type FrozenRoute = ReasoningOption &
  RequestOptions & {
    provider: string;
    model: string;
    adapter?: string;
    mode?: string;
    configurationFingerprint: string;
  };
type Execution = ReasoningOption &
  RequestOptions & {
    adapter: string;
    mode: string;
    readiness: { configurationFingerprint: string };
  };

export const frozenResearchRouteMatches = (
  frozen: FrozenRoute,
  provider: string,
  model: string,
  execution: Execution,
) =>
  frozen.provider === provider &&
  frozen.model === model &&
  (frozen.adapter === undefined || frozen.adapter === execution.adapter) &&
  (frozen.mode === undefined || frozen.mode === execution.mode) &&
  frozen.configurationFingerprint === execution.readiness.configurationFingerprint &&
  frozen.reasoningEnabled === execution.reasoningEnabled &&
  JSON.stringify(frozen.requestOptions ?? null) ===
    JSON.stringify(execution.requestOptions ?? null);

export const readFrozenResearchReasoning = (
  value: Record<string, unknown>,
): { reasoningEnabled?: boolean } => {
  if (value.reasoningEnabled === undefined) return {};
  if (typeof value.reasoningEnabled !== 'boolean') throw new Error('冻结研究推理开关无效');
  return { reasoningEnabled: value.reasoningEnabled };
};
