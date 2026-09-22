import type { AiTestRuntimeInput } from './ai-provider.service.js';

export const aiTestRuntimeFingerprint = (input: AiTestRuntimeInput) => {
  return JSON.stringify({
    name: input.name,
    baseUrl: input.baseUrl,
    models: input.models,
    modelReasoning: input.modelReasoning ?? null,
    enabled: input.enabled,
    priority: input.priority,
    capabilities: input.capabilities,
    authMode: input.authMode,
    timeoutMs: input.timeoutMs ?? null,
    firstOutputTimeoutMs: input.firstOutputTimeoutMs ?? null,
    outputIdleTimeoutMs: input.outputIdleTimeoutMs ?? null,
    modelPricing: input.modelPricing ?? null,
    costPer1kInput: input.costPer1kInput ?? null,
    costPer1kOutput: input.costPer1kOutput ?? null,
    costCurrency: input.costCurrency ?? null,
    upstreamFormat: input.upstreamFormat,
    chatImplementation: input.chatImplementation ?? null,
    compatibilityExtensionProfile: input.compatibilityExtensionProfile ?? null,
    executionRoutes: input.executionRoutes ?? null,
  });
};
