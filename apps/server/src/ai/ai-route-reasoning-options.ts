import { BadRequestException } from '@nestjs/common';
import type { AiProviderInput, ReasoningEffort } from './ai-provider.contracts.js';

export type AiRouteReasoning = {
  reasoningEnabled?: boolean | undefined;
  reasoningEffort?: ReasoningEffort | undefined;
};

export const aiRouteReasoningFields = (route: AiRouteReasoning = {}) => ({
  ...(route.reasoningEnabled === undefined ? {} : { reasoningEnabled: route.reasoningEnabled }),
  ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
});

export function assertRouteReasoningEfforts(input: AiProviderInput) {
  for (const route of input.executionRoutes ?? []) {
    if (route.reasoningEffort === undefined) continue;
    const metadata = input.modelReasoning?.[route.model];
    if (
      !metadata?.supportedEfforts?.includes(route.reasoningEffort) ||
      (metadata.mandatory === true && route.reasoningEffort === 'none')
    )
      throw new BadRequestException(
        `模型 ${route.model} 未声明支持推理强度 ${route.reasoningEffort}`,
      );
  }
}
