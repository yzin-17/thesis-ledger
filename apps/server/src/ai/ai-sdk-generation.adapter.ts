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
  type AiGenerationHttpRequestDiagnostic,
  type AiModelRequestOptions,
} from '@thesis-ledger/schemas';
import type { z } from 'zod';
import { sdkSemanticProgress, sdkStreamAbortError } from './ai-sdk-stream-lifecycle.js';
import type { AdaptiveTimeoutDecision } from './adaptive/ai-adaptive-policy.js';
import type { AiExecutionTimeoutDecision } from './timeout/ai-timeout-policy.js';
import { AiGenerationTiming } from './timeout/ai-generation-timing.js';
import { traceSdkGeneration } from './trace/ai-trace-sdk.js';
import type { AiCompatibilityExtensionProfile } from './ai-provider-upstream.js';
import { createGenerationModel } from './ai-sdk-generation-model.js';
import {
  createGenerationDiagnostics,
  generationDiagnosticSnapshots,
  generationHttpRequestFields,
  type AiGenerationDiagnostics,
} from './ai-generation-diagnostics.js';
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
  type: 'reasoning' | 'text' | 'tool' | 'heartbeat';
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
  requestOptions?: AiModelRequestOptions;
  reasoningEffort?: ReasoningEffort;
  reasoningEnabled?: boolean;
  timeout: {
    /** 总时长上限；流式请求可以不设，此时由 firstChunkMs / chunkMs 判活。 */
    totalMs?: number;
    firstChunkMs?: number;
    chunkMs?: number;
  };
  signal: AbortSignal;
  onProgress?: (progress: AiSdkProgress) => void;
  /** 传输边界可注入原生 HTTP 或受控响应适配器；SDK 解析逻辑保持一致。 */
  httpClient?: typeof fetch;
  adaptiveExecution?: AdaptiveTimeoutDecision;
  timeoutDecision?: AiExecutionTimeoutDecision;
  executionIdentity?: { runId: string; executionAttempt: number };
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
  httpRequest?: AiGenerationHttpRequestDiagnostic;
  timing?: ReturnType<AiGenerationTiming['snapshot']>;
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
  diagnostics?: AiGenerationDiagnostics,
) => ({
  model: createGenerationModel(input, diagnostics?.stream, diagnostics?.http),
  ...sdkPrompt(input.messages),
  maxRetries: 0,
  abortSignal: input.signal,
  timeout: timeoutFor(input),
  telemetry,
  ...providerOptionsFor(input),
  onLanguageModelCallEnd: ({ usage }: { usage: LanguageModelUsage }) => onUsage(usage),
  ...(input.maxOutputTokens === undefined || input.requestOptions?.outputTokenLimit === 'upstream'
    ? {}
    : { maxOutputTokens: input.maxOutputTokens }),
});

export class AiSdkGenerationAdapter {
  async generate<OUTPUT>(
    input: AiSdkGenerationRequest<OUTPUT>,
  ): Promise<AiSdkGenerationResult<OUTPUT>> {
    return traceSdkGeneration(input, () => this.generateObserved(input));
  }

  private async generateObserved<OUTPUT>(
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
    const diagnostics = createGenerationDiagnostics(input);
    const startedAt = performance.now();
    const timing = new AiGenerationTiming(input);
    const onProgress = input.onProgress;
    input = {
      ...input,
      onProgress: (progress) => {
        if (progress.type !== 'heartbeat') timing.progress();
        onProgress?.(progress);
      },
    };
    let observedUsage: AiUsageFacts = { status: 'unknown', inputTokens: null, outputTokens: null };
    const captureUsage = (usage: LanguageModelUsage) => {
      observedUsage = usageFacts(usage);
    };
    try {
      if (input.transport === 'stream') {
        const result = await this.stream(input, startedAt, captureUsage, diagnostics);
        return { ...result, ...(input.timeoutDecision ? { timing: timing.snapshot(true) } : {}) };
      }
      const result = await generateText({
        ...commonOptions(input, captureUsage, diagnostics),
        output: generationOutput(input.mode, input.schema),
      });
      captureUsage(result.usage);
      assertFinishReason(result.finishReason, input.requestId, observedUsage);
      return {
        output: parseGenerationOutput(input.mode, input.schema, result.output),
        ...(input.timeoutDecision ? { timing: timing.snapshot(true) } : {}),
        ...generationHttpRequestFields(diagnostics),
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
      const interruption = timing.interruption(error);
      if (interruption) {
        throw withGenerationRuntimeDiagnostic(
          new AiSdkGenerationError(
            interruption,
            error instanceof AiSdkGenerationError ? error.usage : observedUsage,
            { cause: error },
          ),
          input.mode,
          ...generationDiagnosticSnapshots(diagnostics),
        );
      }
      if (error instanceof AiSdkGenerationError) {
        const observed =
          timing.hasProgress() && error.fact.externalResult === 'rejected_before_generation'
            ? new AiSdkGenerationError({ ...error.fact, externalResult: 'unknown' }, error.usage, {
                cause: error,
              })
            : error;
        throw withGenerationRuntimeDiagnostic(
          observed,
          input.mode,
          ...generationDiagnosticSnapshots(diagnostics),
        );
      }
      const name = error instanceof Error ? error.name : asRecord(error)?.name;
      const summary = sanitize(error);
      if (
        error instanceof SyntaxError ||
        name === 'ZodError' ||
        (typeof name === 'string' && name.includes('NoOutputGeneratedError')) ||
        summary.startsWith('No object generated')
      ) {
        throw schemaGenerationFailure(
          error,
          input,
          observedUsage,
          ...generationDiagnosticSnapshots(diagnostics),
        );
      }
      throw withGenerationRuntimeDiagnostic(
        new AiSdkGenerationError(
          errorFact(error, input.requestId, 'request', true),
          observedUsage,
          { cause: error },
        ),
        input.mode,
        ...generationDiagnosticSnapshots(diagnostics),
      );
    }
  }

  private async stream<OUTPUT>(
    input: AiSdkGenerationRequest<OUTPUT>,
    startedAt: number,
    onUsage: (usage: LanguageModelUsage) => void,
    diagnostics?: AiGenerationDiagnostics,
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
        streamError ??= error;
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
      diagnostics?.stream.observeSdkPart(part);
      if (part.type === 'error') streamError ??= part.error;
      if (part.type === 'abort') {
        throw sdkStreamAbortError(streamError, part.reason, input.signal);
      }
      const progress = sdkSemanticProgress(part);
      if (progress !== null) {
        const elapsed = performance.now() - startedAt;
        firstEvent ??= elapsed;
        input.onProgress?.({ type: progress, at: new Date().toISOString() });
        if (progress === 'text') firstText ??= elapsed;
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
      ...generationHttpRequestFields(diagnostics),
      ...resultMetadata(usage, finishReason, rawFinishReason, response, providerMetadata, {
        firstEvent,
        firstText,
      }),
    };
  }
}
