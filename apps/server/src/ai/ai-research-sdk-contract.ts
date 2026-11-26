import {
  aiExecutionSummarySchema,
  researchGenerationV2Contract,
  researchGenerationV2Schema,
  type ResearchGenerationV2,
  type AiProviderModelExecution,
  type AiAuthMode,
  type AiModelRequestOptions,
} from '@thesis-ledger/schemas';
import type { AiExecutionOwnership } from './ai-execution-state.store.js';
import type { ReasoningEffort } from './ai-provider.contracts.js';
import type { AiSdkGenerationResult, AiSdkGenerationRequest } from './ai-sdk-generation.adapter.js';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';
import { researchOutputSchemaV2 } from './ai-research-output-schema-v2.js';
import { researchReasoningFields } from './ai-research-reasoning-options.js';
import { aiRequestOptionsFields } from './ai-model-request-options.js';

type CommonInput = {
  ownership: AiExecutionOwnership;
  run: { provider: string; model: string; modelMetadata: unknown };
  messages: unknown[];
  startedAt: number;
  signal: AbortSignal;
};
export type ResearchExecutionInput = CommonInput & {
  buildResult: (output: ResearchGenerationV2, provider: string, model: string) => unknown;
};
export type ResearchSdkOutput = ResearchGenerationV2;

export function researchSdkAdapterRequest(input: {
  requestId: string;
  providerId: string;
  model: string;
  runtime: { baseURL: string; apiKey: string; authMode?: AiAuthMode | undefined };
  route: AiProviderModelExecution;
  frozen:
    | {
        reasoningEnabled?: boolean | undefined;
        reasoningEffort?: ReasoningEffort | undefined;
        requestOptions?: AiModelRequestOptions;
      }
    | undefined;
  contract: ReturnType<typeof researchSdkProtocol>['contract'];
  messages: unknown[];
  signal: AbortSignal;
  remainingMs: number;
  outputTokens: number;
  executionIdentity?: AiExecutionOwnership;
}): AiSdkGenerationRequest<ResearchSdkOutput> {
  return {
    requestId: input.requestId,
    providerId: input.providerId,
    adapter: input.route.adapter,
    ...(input.route.compatibilityExtensionProfile === undefined
      ? {}
      : { compatibilityExtensionProfile: input.route.compatibilityExtensionProfile }),
    baseURL: input.runtime.baseURL,
    authMode: input.runtime.authMode ?? 'api_key',
    apiKey: input.runtime.apiKey,
    model: input.model,
    messages: input.messages,
    contract: input.contract.ref,
    schema: input.contract.schema,
    mode: input.route.mode,
    ...researchReasoningFields(input.frozen),
    ...aiRequestOptionsFields(input.frozen),
    transport: 'stream',
    ...(input.frozen?.requestOptions?.outputTokenLimit === 'upstream'
      ? {}
      : { maxOutputTokens: input.outputTokens }),
    timeout: {
      totalMs: input.remainingMs,
      ...(input.route.firstOutputTimeoutMs === undefined
        ? {}
        : { firstChunkMs: input.route.firstOutputTimeoutMs }),
      ...(input.route.outputIdleTimeoutMs === undefined
        ? {}
        : { chunkMs: input.route.outputIdleTimeoutMs }),
    },
    signal: input.signal,
    ...(input.executionIdentity ? { executionIdentity: input.executionIdentity } : {}),
  };
}

export function researchSdkProtocol(input: ResearchExecutionInput) {
  const value = input.run.modelMetadata;
  const metadata =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const parsed = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
  if (!parsed.success || !parsed.data.frozenPolicy || !parsed.data.deadlineAt)
    throw new Error('研究任务缺少冻结执行策略');
  if (parsed.data.contract.version !== researchGenerationV2Contract.ref.version)
    throw new Error('研究执行合同与任务冻结版本不一致');
  const frozen = verifyAiFrozenResearchV2(metadata.frozenResearch);
  const routes = metadata.researchRoutes;
  if (
    !Array.isArray(routes) ||
    routes.length === 0 ||
    routes.some((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
      const route = value as Record<string, unknown>;
      return ![
        route.provider, route.model, route.configurationFingerprint, route.adapter, route.mode,
      ].every((entry) => typeof entry === 'string' && entry.length > 0);
    })
  )
    throw new Error('研究任务缺少完整的冻结执行路由');
  return {
    execution: parsed.data,
    contract: { ...researchGenerationV2Contract, schema: researchOutputSchemaV2(frozen) },
  };
}

export function buildResearchSdkResult(
  input: ResearchExecutionInput,
  generated: AiSdkGenerationResult<ResearchSdkOutput>,
  provider: string,
  model: string,
) {
  const actualModel = generated.actualModel ?? model;
  return input.buildResult(researchGenerationV2Schema.parse(generated.output), provider, actualModel);
}
