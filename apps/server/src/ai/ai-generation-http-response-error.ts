import { createHash } from 'node:crypto';
import type { AiGenerationRuntimeDiagnostic } from '@thesis-ledger/schemas';
import { generationStructuralPreview } from './ai-generation-structural-preview.js';

type Diagnostic = NonNullable<AiGenerationRuntimeDiagnostic['httpResponse']>;
type ResponseError = NonNullable<Diagnostic['error']>;
type Facts = Omit<ResponseError, 'origin' | 'structuralPreview' | 'truncated' | 'upstream'>;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const categories: [RegExp, Facts['category']][] = [
  [
    /reasoning.*(?:mandatory|required|cannot.*disable)|cannot.*disable.*reasoning/iu,
    'mandatory_reasoning',
  ],
  [/unsupported.*param|parameter.*not.*support|no.*endpoints.*support/iu, 'unsupported_parameter'],
  [/rate.?limit|too many requests/iu, 'rate_limit'],
  [/overload|capacity|temporarily unavailable/iu, 'overloaded'],
  [/context.*(?:limit|length)|too many tokens/iu, 'context_limit'],
  [/quota|insufficient.*(?:credit|balance)/iu, 'quota'],
  [/unauthori|authentication|invalid.*api.?key/iu, 'authentication'],
  [/provider returned error|upstream error/iu, 'provider_error'],
];

const messageFacts = (message: unknown): Omit<Facts, 'code'> => {
  if (typeof message !== 'string')
    return { category: 'other', messageCharacters: null, messageSha256: null };
  return {
    category: categories.find(([pattern]) => pattern.test(message.slice(0, 8192)))?.[1] ?? 'other',
    messageCharacters: message.length,
    messageSha256: createHash('sha256').update(message).digest('hex'),
  };
};

const errorFacts = (value: unknown): Facts => {
  const source = record(value);
  const code = source?.code;
  return {
    code: typeof code === 'number' && Number.isSafeInteger(code) && code >= 0 ? code : null,
    ...messageFacts(typeof value === 'string' ? value : source?.message),
  };
};

export const parseHttpResponseJson = (text: string): { value: unknown; valid: boolean } => {
  try {
    return { value: JSON.parse(text) as unknown, valid: true };
  } catch {
    return { value: null, valid: false };
  }
};

const upstreamFacts = (value: unknown): Facts | null => {
  const raw = record(record(value)?.metadata)?.raw;
  if (typeof raw !== 'string' || raw.length > 8192) return null;
  const parsed = parseHttpResponseJson(raw);
  return errorFacts(record(parsed.value)?.error ?? parsed.value ?? raw);
};

/** 固定分类来自有界错误消息，所有自由文本仅保留摘要和遮蔽结构。 */
export const httpResponseError = (
  text: string,
  value: unknown,
  origin: ResponseError['origin'],
): ResponseError => ({
  ...errorFacts(value),
  origin,
  ...generationStructuralPreview(text, 8192, 192),
  upstream: upstreamFacts(value),
});

export const httpResponseErrorValue = (value: unknown) => record(value)?.error;
