import { BadRequestException } from '@nestjs/common';
import type {
  OptimizationModelConfigSnapshot,
  OptimizationReasoningEffort,
} from '@thesis-ledger/schemas';
import type { AiProviderRegistry } from '../ai/provider-registry.js';
import {
  optimizationCostFacts,
  optimizationPricingForModel,
} from './strategy-optimization-cost.js';

export type OptimizationModelRoute = {
  provider: string;
  model: string;
  reasoningEffort?: OptimizationReasoningEffort | undefined;
};

export type OptimizationModelConfig = OptimizationModelConfigSnapshot;

export const optimizationReasoningEffortSupported = (
  reasoning:
    | {
        supportedEfforts?: readonly string[] | null | undefined;
        mandatory?: boolean | undefined;
      }
    | undefined,
  effort: string | undefined,
) => {
  if (effort === undefined) return true;
  return Boolean(
    reasoning?.supportedEfforts?.includes(effort as OptimizationReasoningEffort) &&
    !(reasoning.mandatory === true && effort === 'none'),
  );
};

export const buildOptimizationModelConfig = (
  routes: readonly OptimizationModelRoute[],
  providers: AiProviderRegistry,
): OptimizationModelConfig[] =>
  routes.map((route) => {
    const provider = providers.strict(route.provider, route.model);
    const reasoning = provider.metadata?.modelReasoning?.[route.model];
    if (!optimizationReasoningEffortSupported(reasoning, route.reasoningEffort))
      throw new BadRequestException(
        `模型 ${route.provider}:${route.model} 未声明支持推理强度 ${route.reasoningEffort}`,
      );
    const costFacts = optimizationCostFacts(provider.metadata, route.model);
    const pricing = optimizationPricingForModel(provider.metadata, route.model);
    return {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      ...costFacts,
      ...(pricing?.costPer1kInput === undefined
        ? {}
        : { costPer1kInput: pricing.costPer1kInput }),
      ...(pricing?.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: pricing.costPer1kOutput }),
    };
  });
