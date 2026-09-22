import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible, type MetadataExtractor } from '@ai-sdk/openai-compatible';
import {
  generateText,
  modelMessageSchema,
  streamText,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type TextStreamPart,
} from 'ai';
import {
  aiGenerationErrorSchema,
  type AiAdapter,
  type AiGenerationContractRef,
  type AiGenerationMode,
  type AiUsageFacts,
  type AiAuthMode,
} from '@thesis-ledger/schemas';
import type { z } from 'zod';
import {
  AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';
import {
  generationOutput,
  parseGenerationOutput,
  validateGenerationRequest,
} from './ai-generation-output.js';
import {
  AiSdkGenerationError,
  assertFinishReason,
  errorFact,
  resultMetadata,
  sanitize,
  usageFacts,
} from './ai-sdk-generation-facts.js';

export { AiSdkGenerationError } from './ai-sdk-generation-facts.js';

type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AiSdkProgress = {
  type: 'reasoning' | 'text' | 'heartbeat';
  at: string;
};

export type AiSdkGenerationRequest<OUTPUT> = {
  requestId: string;
  adapter: AiAdapter;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  authMode?: AiAuthMode;
  providerId: string;
  baseURL: string;
  apiKey: string;
  model: string;
  messages: unknown[];
  contract: AiGenerationContractRef;
  schema: z.ZodType<OUTPUT>;
  mode: AiGenerationMode;
  transport: 'single' | 'stream';
  maxOutputTokens?: number;
  reasoningEffort?: ReasoningEffort;
  timeout: {
    totalMs: number;
    firstChunkMs?: number;
    chunkMs?: number;
  };
  signal: AbortSignal;
  onProgress?: (progress: AiSdkProgress) => void;
};

export type AiSdkGenerationResult<OUTPUT> = {
  output: OUTPUT;
  finishReason: FinishReason;
  rawFinishReason: string | null;
  usage: AiUsageFacts;
  actualModel: string | null;
  providerCost: string | null;
  providerCostCurrency: string | null;
  timeToFirstEventMs: number | null;
  timeToFirstTextMs: number | null;
};

const telemetry = { isEnabled: false, recordInputs: false, recordOutputs: false } as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const openRouterCostMetadata = (value: unknown) => {
  const usage = asRecord(asRecord(value)?.usage);
  const cost = usage?.cost;
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return undefined;
  return { openrouter: { usage: { cost } } };
};

const openRouterMetadataExtractor: MetadataExtractor = {
  extractMetadata: ({ parsedBody }) => Promise.resolve(openRouterCostMetadata(parsedBody)),
  createStreamExtractor: () => {
    let metadata: ReturnType<typeof openRouterCostMetadata>;
    return {
      processChunk: (parsedChunk) => {
        metadata = openRouterCostMetadata(parsedChunk) ?? metadata;
      },
      buildMetadata: () => metadata,
    };
  },
};

const convertCompatibleUsage = (
  usage:
    | {
        prompt_tokens?: number | null | undefined;
        completion_tokens?: number | null | undefined;
        prompt_tokens_details?: { cached_tokens?: number | null | undefined } | null | undefined;
        completion_tokens_details?:
          { reasoning_tokens?: number | null | undefined } | null | undefined;
      }
    | null
    | undefined,
) => ({
  inputTokens: {
    total: usage?.prompt_tokens ?? undefined,
    noCache: undefined,
    cacheRead: usage?.prompt_tokens_details?.cached_tokens ?? undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: usage?.completion_tokens ?? undefined,
    text: undefined,
    reasoning: usage?.completion_tokens_details?.reasoning_tokens ?? undefined,
  },
});

const compatibilityProfile = <OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>) =>
  input.compatibilityExtensionProfile ??
  (input.adapter === 'openrouter' ? AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1 : undefined);

const openRouterTransform = <OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>) => {
  if (compatibilityProfile(input) !== AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1)
    return undefined;
  return (body: Record<string, unknown>) => {
    if (input.mode !== 'native_schema') return body;
    return { ...body, provider: { require_parameters: true } };
  };
};

const noAuthFetch = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const headers = new Headers(init?.headers);
  for (const header of ['authorization', 'x-api-key', 'api-key']) headers.delete(header);
  return globalThis.fetch(input, { ...init, headers });
};

const modelFor = <OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>): LanguageModel => {
  if (
    compatibilityProfile(input) === AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1 &&
    input.reasoningEffort === 'max'
  )
    throw new AiSdkGenerationError(
      aiGenerationErrorSchema.parse({
        code: 'capability_unsupported',
        phase: 'preflight',
        summary: 'OpenRouter 兼容扩展不支持 max reasoning effort',
        externalResult: 'not_sent',
        requestId: input.requestId,
      }),
      { status: 'unknown', inputTokens: null, outputTokens: null },
    );
  const noAuth = input.authMode === 'none' ? { fetch: noAuthFetch } : {};
  if (input.adapter === 'openai-chat') {
    return createOpenAI({ baseURL: input.baseURL, apiKey: input.apiKey, ...noAuth }).chat(
      input.model,
    );
  }
  if (input.adapter === 'openai-responses') {
    return createOpenAI({ baseURL: input.baseURL, apiKey: input.apiKey, ...noAuth }).responses(
      input.model,
    );
  }
  if (input.adapter === 'anthropic-messages') {
    return createAnthropic({ baseURL: input.baseURL, apiKey: input.apiKey, ...noAuth }).messages(
      input.model,
    );
  }
  const transformRequestBody = openRouterTransform(input);
  return createOpenAICompatible({
    name: 'compatible',
    baseURL: input.baseURL,
    apiKey: input.apiKey,
    ...noAuth,
    includeUsage: true,
    supportsStructuredOutputs: input.mode === 'native_schema',
    convertUsage: convertCompatibleUsage,
    ...(transformRequestBody === undefined ? {} : { transformRequestBody }),
    ...(compatibilityProfile(input) === AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1
      ? { metadataExtractor: openRouterMetadataExtractor }
      : {}),
  }).chatModel(input.model);
};

const providerOptionsFor = <OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>) => {
  if (input.reasoningEffort === undefined) return {};
  if (input.adapter === 'anthropic-messages') {
    if (input.reasoningEffort === 'minimal')
      throw new AiSdkGenerationError(
        aiGenerationErrorSchema.parse({
          code: 'capability_unsupported',
          phase: 'preflight',
          summary: 'Anthropic Messages 不支持 minimal reasoning effort',
          externalResult: 'not_sent',
          requestId: input.requestId,
        }),
      );
    if (input.reasoningEffort === 'none') return {};
    return { providerOptions: { anthropic: { effort: input.reasoningEffort } } };
  }
  if (input.adapter === 'openai-chat' || input.adapter === 'openai-responses')
    return { providerOptions: { openai: { reasoningEffort: input.reasoningEffort } } };
  return {
    providerOptions: {
      compatible: { reasoningEffort: input.reasoningEffort },
    },
  };
};

const timeoutFor = <OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>) => ({
  totalMs: input.timeout.totalMs,
  ...(input.transport === 'stream' && input.timeout.firstChunkMs !== undefined
    ? { firstChunkMs: input.timeout.firstChunkMs }
    : {}),
  ...(input.transport === 'stream' && input.timeout.chunkMs !== undefined
    ? { chunkMs: input.timeout.chunkMs }
    : {}),
});

const sdkPrompt = (messages: unknown[]) => {
  const parsed = modelMessageSchema.array().parse(messages);
  const instructions = parsed
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  return {
    messages: parsed.filter((message) => message.role !== 'system'),
    ...(instructions ? { instructions } : {}),
  };
};

const commonOptions = <OUTPUT>(
  input: AiSdkGenerationRequest<OUTPUT>,
  onUsage: (usage: LanguageModelUsage) => void,
) => ({
  model: modelFor(input),
  ...sdkPrompt(input.messages),
  maxRetries: 0,
  abortSignal: input.signal,
  timeout: timeoutFor(input),
  telemetry,
  ...providerOptionsFor(input),
  onLanguageModelCallEnd: ({ usage }: { usage: LanguageModelUsage }) => onUsage(usage),
  ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
});

export class AiSdkGenerationAdapter {
  async generate<OUTPUT>(
    input: AiSdkGenerationRequest<OUTPUT>,
  ): Promise<AiSdkGenerationResult<OUTPUT>> {
    try {
      validateGenerationRequest(input);
    } catch (error) {
      if (error instanceof AiSdkGenerationError) throw error;
      throw new AiSdkGenerationError(
        errorFact(error, input.requestId, 'preflight', false),
        { status: 'unknown', inputTokens: null, outputTokens: null },
        { cause: error },
      );
    }
    const startedAt = Date.now();
    let observedUsage: AiUsageFacts = { status: 'unknown', inputTokens: null, outputTokens: null };
    const captureUsage = (usage: LanguageModelUsage) => {
      observedUsage = usageFacts(usage);
    };
    try {
      if (input.transport === 'stream') return await this.stream(input, startedAt, captureUsage);
      const result = await generateText({
        ...commonOptions(input, captureUsage),
        output: generationOutput(input.mode, input.schema),
      });
      captureUsage(result.usage);
      assertFinishReason(result.finishReason, input.requestId, observedUsage);
      return {
        output: parseGenerationOutput(input.mode, input.schema, result.output),
        ...resultMetadata(
          result.usage,
          result.finishReason,
          result.rawFinishReason,
          result.response,
          result.providerMetadata,
          { firstEvent: null, firstText: null },
        ),
      };
    } catch (error) {
      if (input.signal.aborted) {
        throw new AiSdkGenerationError(
          aiGenerationErrorSchema.parse({
            code: 'cancelled',
            phase: 'cancellation',
            summary: '生成请求已取消',
            externalResult: 'unknown',
            requestId: input.requestId,
          }),
          error instanceof AiSdkGenerationError ? error.usage : observedUsage,
          { cause: error },
        );
      }
      if (error instanceof AiSdkGenerationError) throw error;
      const name = error instanceof Error ? error.name : asRecord(error)?.name;
      const summary = sanitize(error);
      if (
        error instanceof SyntaxError ||
        name === 'ZodError' ||
        (typeof name === 'string' && name.includes('NoOutputGeneratedError')) ||
        summary.startsWith('No object generated')
      ) {
        throw new AiSdkGenerationError(
          aiGenerationErrorSchema.parse({
            code: 'schema_invalid',
            phase: 'validation',
            summary,
            externalResult: 'complete',
            requestId: input.requestId,
          }),
          observedUsage,
          { cause: error },
        );
      }
      throw new AiSdkGenerationError(
        errorFact(error, input.requestId, 'request', true),
        observedUsage,
        { cause: error },
      );
    }
  }

  private async stream<OUTPUT>(
    input: AiSdkGenerationRequest<OUTPUT>,
    startedAt: number,
    onUsage: (usage: LanguageModelUsage) => void,
  ): Promise<AiSdkGenerationResult<OUTPUT>> {
    let observedUsage: AiUsageFacts = { status: 'unknown', inputTokens: null, outputTokens: null };
    const captureUsage = (usage: LanguageModelUsage) => {
      observedUsage = usageFacts(usage);
      onUsage(usage);
    };
    let streamError: unknown;
    let firstEvent: number | null = null;
    let firstText: number | null = null;
    const result = streamText({
      ...commonOptions(input, captureUsage),
      output: generationOutput(input.mode, input.schema),
      onError: ({ error }) => {
        streamError = error;
      },
    });
    // Consume rejection immediately; await the value only after terminal facts are captured.
    const completedOutput = result.output.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    for await (const part of result.stream as AsyncIterable<
      TextStreamPart<Record<string, never>>
    >) {
      if (part.type === 'error') streamError = part.error;
      if (part.type === 'abort')
        throw new DOMException(part.reason ?? 'Provider stream aborted', 'AbortError');
      if (part.type === 'reasoning-delta' || part.type === 'text-delta') {
        const elapsed = Date.now() - startedAt;
        firstEvent ??= elapsed;
        input.onProgress?.({
          type: part.type === 'reasoning-delta' ? 'reasoning' : 'text',
          at: new Date().toISOString(),
        });
        if (part.type === 'text-delta') firstText ??= elapsed;
      }
    }
    if (streamError)
      throw new AiSdkGenerationError(
        errorFact(streamError, input.requestId, 'stream', true),
        observedUsage,
        { cause: streamError },
      );
    const [finishReason, rawFinishReason, usage, response, providerMetadata] = await Promise.all([
      result.finishReason,
      result.rawFinishReason,
      result.usage,
      result.response,
      result.providerMetadata,
    ]);
    captureUsage(usage);
    assertFinishReason(finishReason, input.requestId, observedUsage);
    const complete = await completedOutput;
    if (!complete.ok) throw complete.error;
    return {
      output: parseGenerationOutput(input.mode, input.schema, complete.value),
      ...resultMetadata(usage, finishReason, rawFinishReason, response, providerMetadata, {
        firstEvent,
        firstText,
      }),
    };
  }
}
