import type { FinishReason, LanguageModelUsage } from 'ai';
import {
  aiGenerationErrorSchema,
  aiUsageFactsSchema,
  type AiGenerationError,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const sanitize = (error: unknown) => {
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
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(Math.ceil(seconds * 1_000), 86_400_000);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  return Math.min(Math.max(0, at - Date.now()), 86_400_000);
};

export const errorFact = (
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

export const usageFacts = (usage: LanguageModelUsage): AiUsageFacts => {
  const inputTokens = usage.inputTokens ?? null;
  const outputTokens = usage.outputTokens ?? null;
  let status: AiUsageFacts['status'] = 'unknown';
  if (inputTokens !== null && outputTokens !== null) status = 'reported';
  else if (inputTokens !== null || outputTokens !== null) status = 'partial';
  return aiUsageFactsSchema.parse({ status, inputTokens, outputTokens });
};

export const assertFinishReason = (
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

export const resultMetadata = (
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
