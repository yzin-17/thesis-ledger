import {
  aiUpstreamSelectionSchema,
  type AiAdapter,
  type AiChatImplementation,
  type AiGenerationMode,
  type AiUpstreamFormat,
} from '@thesis-ledger/schemas';
import type {
  AiProviderInput,
  AiProviderTestKind,
  AiProviderTestPurpose,
  AiProviderModelReasoning,
  AiProviderModelDefaultConfig,
  AiProviderExecutionRouteInput,
} from './ai-provider.contracts.js';
import { resolveCompatibilityProfile, parseAiProviderSettings } from './ai-provider-summary.js';
import {
  runtimeAdapterForSelection,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';
import {
  assertModelRequestOptions,
  mergeModelRequestOptionsDefaults,
} from './ai-model-request-options.js';
import { modelPricingFromInput } from './ai-provider-readiness.persistence.js';

export interface AiTestRuntimeInput {
  name: string;
  requestId?: string;
  baseUrl: string;
  models: string[];
  authMode: 'api_key' | 'none';
  testModel?: string;
  testKind: AiProviderTestKind;
  purpose?: AiProviderTestPurpose;
  mode?: AiGenerationMode;
  budgetAuthorized?: boolean;
  modelPricing?: Readonly<Record<string, AiTestModelPricing>>;
  modelReasoning?: Record<string, AiProviderModelReasoning>;
  modelDefaults?: Record<string, AiProviderModelDefaultConfig>;
  credential: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  timeoutMs?: number;
  firstOutputTimeoutMs?: number;
  outputIdleTimeoutMs?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  adapter: AiAdapter;
  executionRoutes?: AiProviderExecutionRouteInput[];
}

type AiTestModelPricing = {
  costPer1kInput?: number | undefined;
  costPer1kOutput?: number | undefined;
  costCurrency?: string | undefined;
  pricingVersion?: string | undefined;
};

export function buildAiProviderTestRuntime(
  input: AiProviderInput,
  existing: { enabled: boolean; settings?: unknown } | null,
  credential: string,
  testModel?: string,
  testKind: AiProviderTestKind = 'connection',
  budgetAuthorized?: boolean,
  purpose?: AiProviderTestPurpose,
  mode?: AiGenerationMode,
  requestId?: string,
): AiTestRuntimeInput {
  const selection = aiUpstreamSelectionSchema.parse({
    upstreamFormat: input.upstreamFormat,
    ...(input.chatImplementation === undefined
      ? {}
      : { chatImplementation: input.chatImplementation }),
  });
  const compatibilityExtensionProfile = resolveCompatibilityProfile(input, existing?.settings);
  const adapter = runtimeAdapterForSelection(selection, compatibilityExtensionProfile);
  const stored = parseAiProviderSettings(existing?.settings);
  const modelDefaults = mergeModelRequestOptionsDefaults(
    input.modelDefaults,
    stored?.modelDefaults,
    input.models,
  );
  assertModelRequestOptions(
    {
      ...input,
      ...(modelDefaults ? { modelDefaults } : {}),
      modelPricing: modelPricingFromInput(input, input.models, stored),
    },
    adapter,
  );
  return {
    ...(modelDefaults ? { modelDefaults } : {}),
    name: input.name,
    ...(requestId === undefined ? {} : { requestId }),
    baseUrl: input.baseUrl,
    models: input.models,
    authMode: input.authMode,
    ...(testModel === undefined ? {} : { testModel }),
    testKind,
    ...(purpose === undefined ? {} : { purpose }),
    ...(mode === undefined ? {} : { mode }),
    ...(budgetAuthorized === undefined ? {} : { budgetAuthorized }),
    ...(input.modelPricing === undefined ? {} : { modelPricing: input.modelPricing }),
    ...(input.modelReasoning ? { modelReasoning: input.modelReasoning } : {}),
    credential,
    enabled: input.enabled ?? existing?.enabled ?? true,
    priority: input.priority,
    capabilities: input.capabilities ?? ['chat'],
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.firstOutputTimeoutMs === undefined
      ? {}
      : { firstOutputTimeoutMs: input.firstOutputTimeoutMs }),
    ...(input.outputIdleTimeoutMs === undefined
      ? {}
      : { outputIdleTimeoutMs: input.outputIdleTimeoutMs }),
    ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
    ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
    ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
    upstreamFormat: selection.upstreamFormat,
    ...(selection.upstreamFormat === 'chat-completions'
      ? { chatImplementation: selection.chatImplementation }
      : {}),
    ...(compatibilityExtensionProfile ? { compatibilityExtensionProfile } : {}),
    adapter,
    ...(input.executionRoutes === undefined ? {} : { executionRoutes: input.executionRoutes }),
  };
}
