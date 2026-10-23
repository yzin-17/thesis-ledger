import {
  generateText,
  modelMessageSchema,
  streamText,
  type FinishReason,
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
import type { AiCompatibilityExtensionProfile } from './ai-provider-upstream.js';
import { createGenerationModel } from './ai-sdk-generation-model.js';
import { AiGenerationStreamDiagnostics } from './ai-generation-stream-diagnostics.js';
import {
  generationOutput,
  parseGenerationOutput,
  validateGenerationRequest,
} from './ai-generation-output.js';
import {
  schemaGenerationFailure,
  withGenerationRuntimeDiagnostic,
} from './ai-generation-failure-diagnostics.js';
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
    /** 总时长上限；流式请求可以不设，此时由 firstChunkMs / chunkMs 判活。 */
    totalMs?: number;
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
  ...(input.timeout.totalMs === undefined ? {} : { totalMs: input.timeout.totalMs }),
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
  diagnostics?: AiGenerationStreamDiagnostics,
) => ({
  model: createGenerationModel(input, diagnostics),
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
    const diagnostics =
      input.contract.id === 'research' && input.contract.version === 'research-generation-v2'
        ? new AiGenerationStreamDiagnostics(input.adapter, input.transport)
        : undefined;
    const startedAt = Date.now();
    let observedUsage: AiUsageFacts = { status: 'unknown', inputTokens: null, outputTokens: null };
    const captureUsage = (usage: LanguageModelUsage) => {
      observedUsage = usageFacts(usage);
    };
    try {
      if (input.transport === 'stream')
        return await this.stream(input, startedAt, captureUsage, diagnostics);
      const result = await generateText({
        ...commonOptions(input, captureUsage, diagnostics),
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
        throw withGenerationRuntimeDiagnostic(
          new AiSdkGenerationError(
            aiGenerationErrorSchema.parse({
              code: 'cancelled',
              phase: 'cancellation',
              summary: '生成请求已取消',
              externalResult: 'unknown',
              requestId: input.requestId,
            }),
            error instanceof AiSdkGenerationError ? error.usage : observedUsage,
            { cause: error },
          ),
          input.mode,
          diagnostics?.snapshot(),
        );
      }
      if (error instanceof AiSdkGenerationError)
        throw withGenerationRuntimeDiagnostic(error, input.mode, diagnostics?.snapshot());
      const name = error instanceof Error ? error.name : asRecord(error)?.name;
      const summary = sanitize(error);
      if (
        error instanceof SyntaxError ||
        name === 'ZodError' ||
        (typeof name === 'string' && name.includes('NoOutputGeneratedError')) ||
        summary.startsWith('No object generated')
      ) {
        throw schemaGenerationFailure(error, input, observedUsage, diagnostics?.snapshot());
      }
      throw withGenerationRuntimeDiagnostic(
        new AiSdkGenerationError(
          errorFact(error, input.requestId, 'request', true),
          observedUsage,
          { cause: error },
        ),
        input.mode,
        diagnostics?.snapshot(),
      );
    }
  }

  private async stream<OUTPUT>(
    input: AiSdkGenerationRequest<OUTPUT>,
    startedAt: number,
    onUsage: (usage: LanguageModelUsage) => void,
    diagnostics?: AiGenerationStreamDiagnostics,
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
      ...commonOptions(input, captureUsage, diagnostics),
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
      diagnostics?.observeSdkPart(part);
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
