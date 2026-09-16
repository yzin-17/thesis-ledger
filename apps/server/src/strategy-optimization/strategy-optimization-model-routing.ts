import { BadRequestException } from '@nestjs/common';
import type { OptimizationReasoningEffort } from '@thesis-ledger/schemas';
import type { AiProviderRegistry } from '../ai/provider-registry.js';

export type OptimizationModelRoute = {
  provider: string;
  model: string;
  reasoningEffort?: OptimizationReasoningEffort | undefined;
};

export type OptimizationModelConfig = {
  provider: string;
  model: string;
  reasoningEffort?: OptimizationReasoningEffort;
  costStatus: 'known' | 'unknown';
  costCurrency?: string;
  pricingVersion?: string;
};

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
    const costKnown =
      typeof provider.metadata?.costPer1kInput === 'number' &&
      typeof provider.metadata?.costPer1kOutput === 'number';
    return {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      costStatus: costKnown ? ('known' as const) : ('unknown' as const),
      ...(provider.metadata?.costCurrency ? { costCurrency: provider.metadata.costCurrency } : {}),
      ...(provider.metadata?.pricingVersion
        ? { pricingVersion: provider.metadata.pricingVersion }
        : {}),
    };
  });
