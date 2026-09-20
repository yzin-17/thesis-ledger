import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  Output,
  generateText,
  modelMessageSchema,
  streamText,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type TextStreamPart,
} from 'ai';
import {
  aiGenerationContractRefSchema,
  aiGenerationErrorSchema,
  aiUsageFactsSchema,
  type AiAdapter,
  type AiGenerationContractRef,
  type AiGenerationError,
  type AiGenerationMode,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import type { z } from 'zod';

type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AiSdkProgress = {
  type: 'reasoning' | 'text' | 'heartbeat';
  at: string;
};

export type AiSdkGenerationRequest<OUTPUT> = {
  requestId: string;
  adapter: AiAdapter;
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
  allowedUpstreams?: string[];
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

const sanitize = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .slice(0, 500);
};

const statusCode = (error: unknown) => {
  const record = asRecord(error);
  if (typeof record?.statusCode === 'number') return record.statusCode;
  if (typeof record?.status === 'number') return record.status;
  return null;
};

const retryAfterMs = (error: unknown) => {
  const record = asRecord(error);
  const headers = asRecord(record?.responseHeaders) ?? asRecord(record?.headers);
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (typeof raw !== 'string') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds * 1_000), 86_400_000);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  return Math.min(Math.max(0, at - Date.now()), 86_400_000);
};

const errorFact = (
  error: unknown,
  requestId: string,
  phase: AiGenerationError['phase'],
  sent: boolean,
): AiGenerationError => {
  const status = statusCode(error);
  let code: AiGenerationError['code'] = sent ? 'transport_unknown' : 'configuration_invalid';
  let externalResult: AiGenerationError['externalResult'] = sent ? 'unknown' : 'not_sent';
  if (status === 401) {
    code = 'authentication_failed';
    externalResult = 'rejected_before_generation';
  } else if (status === 403) {
    code = 'permission_denied';
    externalResult = 'rejected_before_generation';
  } else if (status === 402) {
    code = 'payment_required';
    externalResult = 'rejected_before_generation';
  } else if (status === 429) {
    code = 'provider_rejected';
    externalResult = 'rejected_before_generation';
  } else if (error instanceof DOMException && error.name === 'AbortError') {
    code = 'cancelled';
  }
  return aiGenerationErrorSchema.parse({
    code,
    phase,
    summary: sanitize(error),
    externalResult,
    requestId,
    ...(code === 'provider_rejected' && retryAfterMs(error) !== undefined
      ? { retryAfterMs: retryAfterMs(error) }
      : {}),
  });
};

export class AiSdkGenerationError extends Error {
  constructor(
    readonly fact: AiGenerationError,
    readonly usage: AiUsageFacts = { status: 'unknown', inputTokens: null, outputTokens: null },
    options?: ErrorOptions,
  ) {
    super(fact.summary, options);
    this.name = 'AiSdkGenerationError';
  }
}

const usageFacts = (usage: LanguageModelUsage): AiUsageFacts => {
  const inputTokens = usage.inputTokens ?? null;
  const outputTokens = usage.outputTokens ?? null;
  let status: AiUsageFacts['status'] = 'unknown';
  if (inputTokens !== null && outputTokens !== null) status = 'reported';
  else if (inputTokens !== null || outputTokens !== null) status = 'partial';
  return aiUsageFactsSchema.parse({ status, inputTokens, outputTokens });
};

const parseJsonText = <OUTPUT>(text: string, schema: z.ZodType<OUTPUT>) => {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Provider 返回空内容');
  const fenced = /^```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)[ \t]*(?:\r?\n)?```$/u.exec(trimmed);
  return schema.parse(JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown);
};

const providerCost = (metadata: unknown) => {
  const root = asRecord(metadata);
  const openrouter = asRecord(root?.openrouter);
  const usage = asRecord(openrouter?.usage);
  const cost = usage?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? String(cost) : null;
};

const actualModel = (response: unknown) => {
  const record = asRecord(response);
  return typeof record?.modelId === 'string' ? record.modelId : null;
};

const assertFinishReason = (
  finishReason: FinishReason,
  requestId: string,
  usage: AiUsageFacts,
) => {
  if (finishReason === 'stop') return;
  let code: AiGenerationError['code'] = 'provider_stream_error';
  if (finishReason === 'length') code = 'output_truncated';
  else if (finishReason === 'content-filter') code = 'refused';
  throw new AiSdkGenerationError(
    aiGenerationErrorSchema.parse({
      code,
      phase: 'validation',
      summary: `Provider 结束原因为 ${finishReason}`,
      externalResult: 'complete',
      requestId,
    }),
    usage,
  );
};

const convertCompatibleUsage = (usage: {
  prompt_tokens?: number | null | undefined;
  completion_tokens?: number | null | undefined;
  prompt_tokens_details?: { cached_tokens?: number | null | undefined } | null | undefined;
  completion_tokens_details?: { reasoning_tokens?: number | null | undefined } | null | undefined;
} | null | undefined) => ({
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

const modelFor = <OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>): LanguageModel => {
  if (input.adapter === 'openrouter') {
    if (input.reasoningEffort === 'max')
      throw new AiSdkGenerationError(
        aiGenerationErrorSchema.parse({
          code: 'capability_unsupported',
          phase: 'preflight',
          summary: 'OpenRouter adapter 不支持 max reasoning effort',
          externalResult: 'not_sent',
          requestId: input.requestId,
        }),
        { status: 'unknown', inputTokens: null, outputTokens: null },
      );
    const provider = createOpenRouter({
      baseURL: input.baseURL,
      apiKey: input.apiKey,
      compatibility: 'strict',
    });
    return provider.chat(input.model, {
      usage: { include: true },
      provider: {
        ...(input.mode === 'native_schema' ? { require_parameters: true } : {}),
        ...(input.allowedUpstreams?.length ? { only: input.allowedUpstreams } : {}),
      },
      ...(input.reasoningEffort === undefined
        ? {}
        : { reasoning: { effort: input.reasoningEffort } }),
    });
  }
  return createOpenAICompatible({
    name: input.providerId,
    baseURL: input.baseURL,
    apiKey: input.apiKey,
    includeUsage: true,
    supportsStructuredOutputs: input.mode === 'native_schema',
    convertUsage: convertCompatibleUsage,
  }).chatModel(input.model);
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
  onLanguageModelCallEnd: ({ usage }: { usage: LanguageModelUsage }) => onUsage(usage),
  ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
});

const resultMetadata = (
  usage: LanguageModelUsage,
  finishReason: FinishReason,
  rawFinishReason: string | undefined,
  response: unknown,
  providerMetadata: unknown,
  timing: { firstEvent: number | null; firstText: number | null },
) => ({
  finishReason,
  rawFinishReason: rawFinishReason ?? null,
  usage: usageFacts(usage),
  actualModel: actualModel(response),
  providerCost: providerCost(providerMetadata),
  providerCostCurrency: providerCost(providerMetadata) === null ? null : 'USD',
  timeToFirstEventMs: timing.firstEvent,
  timeToFirstTextMs: timing.firstText,
});

export class AiSdkGenerationAdapter {
  async generate<OUTPUT>(input: AiSdkGenerationRequest<OUTPUT>): Promise<AiSdkGenerationResult<OUTPUT>> {
    try {
      aiGenerationContractRefSchema.parse(input.contract);
      modelMessageSchema.array().parse(input.messages);
    } catch (error) {
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
      if (input.transport === 'stream') return await this.stream(input, startedAt);
      if (input.mode === 'native_schema') {
        const result = await generateText({
          ...commonOptions(input, captureUsage),
          output: Output.object({ schema: input.schema }),
        });
        assertFinishReason(result.finishReason, input.requestId, usageFacts(result.usage));
        return {
          output: result.output,
          ...resultMetadata(
            result.usage,
            result.finishReason,
            result.rawFinishReason,
            result.response,
            result.providerMetadata,
            { firstEvent: null, firstText: null },
          ),
        };
      }
      const result = await generateText({
        ...commonOptions(input, captureUsage),
        output: Output.text(),
      });
      assertFinishReason(result.finishReason, input.requestId, usageFacts(result.usage));
      return {
        output: parseJsonText(result.output, input.schema),
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
  ): Promise<AiSdkGenerationResult<OUTPUT>> {
    const output =
      input.mode === 'native_schema'
        ? Output.object({ schema: input.schema })
        : Output.text();
    let streamError: unknown;
    let firstEvent: number | null = null;
    let firstText: number | null = null;
    const result = streamText({
      ...commonOptions(input, () => undefined),
      output,
      onError: ({ error }) => {
        streamError = error;
      },
    });
    for await (const part of result.stream as AsyncIterable<TextStreamPart<Record<string, never>>>) {
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
        { status: 'unknown', inputTokens: null, outputTokens: null },
        { cause: streamError },
      );
    const [finishReason, rawFinishReason, usage, response, providerMetadata, completeOutput] =
      await Promise.all([
        result.finishReason,
        result.rawFinishReason,
        result.usage,
        result.response,
        result.providerMetadata,
        result.output,
      ]);
    assertFinishReason(finishReason, input.requestId, usageFacts(usage));
    const parsed =
      input.mode === 'native_schema'
        ? (completeOutput as OUTPUT)
        : parseJsonText(String(completeOutput), input.schema);
    return {
      output: parsed,
      ...resultMetadata(usage, finishReason, rawFinishReason, response, providerMetadata, {
        firstEvent,
        firstText,
      }),
    };
  }
}
