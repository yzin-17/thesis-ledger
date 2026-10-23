import { createHash } from 'node:crypto';
import {
  aiGenerationRuntimeDiagnosticSchema,
  type AiAdapter,
  type AiGenerationRuntimeDiagnostic,
} from '@thesis-ledger/schemas';
import { generationStructuralPreview } from './ai-generation-structural-preview.js';
import { sdkRuntimeVersions } from './ai-sdk-runtime-versions.js';

type Stream = NonNullable<AiGenerationRuntimeDiagnostic['stream']>;
type Provider = NonNullable<Stream['provider']>;
type Sample = Provider['samples'][number];
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const tokenCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const normalizedFinish = (value: unknown): Sample['finishReason'] => {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' &&
    ['stop', 'length', 'content_filter', 'tool_calls', 'error'].includes(value)
  )
    return value as Sample['finishReason'];
  return 'other';
};
const metric = () => {
  let chunks = 0;
  let characters = 0;
  let pendingSurrogate = '';
  const hash = createHash('sha256');
  return {
    add: (text: string) => {
      chunks += 1;
      characters += text.length;
      let joined = pendingSurrogate + text;
      pendingSurrogate = '';
      const last = joined.charCodeAt(joined.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        pendingSurrogate = joined.slice(-1);
        joined = joined.slice(0, -1);
      }
      hash.update(joined);
    },
    snapshot: () => ({
      chunks,
      characters,
      sha256: hash.copy().update(pendingSurrogate).digest('hex'),
    }),
  };
};

/** 每次请求独立，只统计 SDK 已解析帧与已提取事件，不缓存完整正文。 */
export class AiGenerationStreamDiagnostics {
  private readonly packages;
  private readonly providerAvailable;
  private readonly streaming;
  private readonly providerText = metric();
  private readonly providerReasoning = metric();
  private readonly sdkText = metric();
  private readonly sdkReasoning = metric();
  private frames = 0;
  private nonTextContentFrames = 0;
  private unrecognizedDeltaFrames = 0;
  private readonly finishReasons = new Set<NonNullable<Sample['finishReason']>>();
  private reportedUsage: Provider['reportedUsage'] = null;
  private readonly head: Sample[] = [];
  private readonly tail: Sample[] = [];

  constructor(adapter: AiAdapter, transport: 'stream' | 'single') {
    this.packages = sdkRuntimeVersions(adapter);
    this.providerAvailable = this.packages.providerPackage === '@ai-sdk/openai-compatible';
    this.streaming = transport === 'stream';
  }

  observeProviderChunk(value: unknown) {
    const frame = asRecord(value);
    this.frames += 1;
    const choices = frame?.choices;
    const choice = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const delta = asRecord(choice?.delta);
    const content = typeof delta?.content === 'string' ? delta.content : null;
    const rawReasoning = delta?.reasoning_content ?? delta?.reasoning;
    const reasoning = typeof rawReasoning === 'string' ? rawReasoning : null;
    if (content !== null) this.providerText.add(content);
    else if (delta?.content !== null && delta?.content !== undefined)
      this.nonTextContentFrames += 1;
    if (reasoning !== null) this.providerReasoning.add(reasoning);
    if (
      delta &&
      Object.keys(delta).some(
        (key) => !['role', 'content', 'reasoning', 'reasoning_content'].includes(key),
      )
    )
      this.unrecognizedDeltaFrames += 1;
    const finishReason = normalizedFinish(choice?.finish_reason);
    if (finishReason !== null) this.finishReasons.add(finishReason);
    const usage = asRecord(frame?.usage);
    if (usage) {
      this.reportedUsage = {
        inputTokens: tokenCount(usage.prompt_tokens),
        outputTokens: tokenCount(usage.completion_tokens),
        reasoningTokens: tokenCount(asRecord(usage.completion_tokens_details)?.reasoning_tokens),
      };
    }
    this.sample({
      frame: this.frames,
      contentCharacters: content?.length ?? null,
      contentSha256: content === null ? null : createHash('sha256').update(content).digest('hex'),
      contentStructure:
        content === null ? null : generationStructuralPreview(content, 192, 96).structuralPreview,
      reasoningCharacters: reasoning?.length ?? null,
      reasoningSha256:
        reasoning === null ? null : createHash('sha256').update(reasoning).digest('hex'),
      finishReason,
      usage: usage !== null,
    });
  }

  observeSdkPart(part: { type: string; text?: unknown }) {
    if (typeof part.text !== 'string') return;
    if (part.type === 'text-delta') this.sdkText.add(part.text);
    else if (part.type === 'reasoning-delta') this.sdkReasoning.add(part.text);
  }

  snapshot(): AiGenerationRuntimeDiagnostic {
    const provider: Stream['provider'] = this.providerAvailable
      ? {
          frames: this.frames,
          text: this.providerText.snapshot(),
          reasoning: this.providerReasoning.snapshot(),
          nonTextContentFrames: this.nonTextContentFrames,
          unrecognizedDeltaFrames: this.unrecognizedDeltaFrames,
          finishReasons: [...this.finishReasons],
          reportedUsage: this.reportedUsage,
          samples: [...this.head, ...this.tail],
          omittedFrames: this.frames - this.head.length - this.tail.length,
        }
      : null;
    const result: AiGenerationRuntimeDiagnostic = {
      version: 'ai-runtime-diagnostic-v1',
      packages: this.packages,
      stream: this.streaming
        ? {
            provider,
            sdk: { text: this.sdkText.snapshot(), reasoning: this.sdkReasoning.snapshot() },
          }
        : null,
    };
    while (JSON.stringify(result).length > 7168 && provider && provider.samples.length > 0) {
      provider.samples.splice(Math.floor(provider.samples.length / 2), 1);
      provider.omittedFrames += 1;
    }
    return aiGenerationRuntimeDiagnosticSchema.parse(result);
  }

  private sample(sample: Sample) {
    if (this.head.length < 12) this.head.push(sample);
    else {
      this.tail.push(sample);
      if (this.tail.length > 12) this.tail.shift();
    }
  }
}
