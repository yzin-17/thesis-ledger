import { createHash } from 'node:crypto';
import { fetchWithAiTrace } from './trace/ai-trace-http.js';
import { currentAiTrace } from './trace/ai-trace-context.js';
import {
  aiGenerationHttpRequestDiagnosticSchema,
  type AiAuthMode,
  type AiGenerationHttpRequestDiagnostic,
} from '@thesis-ledger/schemas';

type Details = Omit<
  AiGenerationHttpRequestDiagnostic,
  'version' | 'boundary' | 'attempts' | 'omittedRequests'
>;
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const boolean = (value: unknown) => (typeof value === 'boolean' ? value : null);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const effort = (value: unknown): AiGenerationHttpRequestDiagnostic['reasoningEffort'] => {
  if (value === undefined || value === null) return null;
  if (
    typeof value === 'string' &&
    ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)
  )
    return value as NonNullable<AiGenerationHttpRequestDiagnostic['reasoningEffort']>;
  return 'other';
};

const emptyDetails = (): Details => ({
  method: 'other',
  endpoint: 'other',
  bodyStatus: 'unavailable',
  bodyBytes: null,
  bodySha256: null,
  model: null,
  stream: null,
  responseFormat: null,
  schemaStrict: null,
  schemaSha256: null,
  requireParameters: null,
  tokenLimits: { max_tokens: null, max_completion_tokens: null, max_output_tokens: null },
  reasoningEffort: null,
  reasoning: null,
  includeUsage: null,
  toolCount: null,
  truncated: false,
});

const transportDetails = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Pick<Details, 'method' | 'endpoint'> => {
  const result: Pick<Details, 'method' | 'endpoint'> = { method: 'other', endpoint: 'other' };
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()))
    result.method = method.toUpperCase() as Details['method'];
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.endsWith('/chat/completions')) result.endpoint = 'chat_completions';
  else if (url.pathname.endsWith('/responses')) result.endpoint = 'responses';
  else if (url.pathname.endsWith('/messages')) result.endpoint = 'messages';
  return result;
};

const safeModel = (model: unknown): Details['model'] => {
  if (
    typeof model === 'string' &&
    /^[A-Za-z0-9_.:/-]{1,200}$/u.test(model) &&
    !/(?:sk-|bearer|api[_-]?key)/iu.test(model)
  )
    return model;
  return null;
};

const responseFormat = (value: unknown): Details['responseFormat'] => {
  if (value === undefined) return null;
  if (typeof value === 'string' && ['json_schema', 'json_object', 'text'].includes(value))
    return value as NonNullable<Details['responseFormat']>;
  return 'other';
};

const formatDetails = (value: unknown) => {
  const format = asRecord(value);
  const schema = asRecord(format?.json_schema);
  let schemaSha256: string | null = null;
  if (schema?.schema !== undefined) {
    const serialized = JSON.stringify(schema.schema);
    if (typeof serialized === 'string') schemaSha256 = sha256(serialized);
  }
  return {
    responseFormat: responseFormat(format?.type),
    schemaStrict: boolean(schema?.strict),
    schemaSha256,
  };
};

const reasoningDetails = (value: unknown): Details['reasoning'] => {
  const reasoning = asRecord(value);
  if (!reasoning && typeof value !== 'boolean') return null;
  return {
    effort: effort(reasoning?.effort),
    enabled: boolean(reasoning?.enabled ?? value),
    exclude: boolean(reasoning?.exclude),
    maxTokens: count(reasoning?.max_tokens),
  };
};

const parameterDetails = (body: Record<string, unknown>): Partial<Details> => ({
  model: safeModel(body.model),
  stream: boolean(body.stream),
  ...formatDetails(body.response_format),
  requireParameters: boolean(asRecord(body.provider)?.require_parameters),
  tokenLimits: {
    max_tokens: count(body.max_tokens),
    max_completion_tokens: count(body.max_completion_tokens),
    max_output_tokens: count(body.max_output_tokens),
  },
  reasoningEffort: effort(body.reasoning_effort),
  reasoning: reasoningDetails(body.reasoning),
  includeUsage: boolean(asRecord(body.stream_options)?.include_usage),
  toolCount: Array.isArray(body.tools) ? body.tools.length : null,
});

const bodyDetails = (text: unknown): Partial<Details> => {
  if (typeof text !== 'string') return {};
  const result = { bodyBytes: Buffer.byteLength(text), bodySha256: sha256(text) };
  if (result.bodyBytes > 262144) return { ...result, bodyStatus: 'oversize', truncated: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...result, bodyStatus: 'non_json' };
  }
  const body = asRecord(parsed);
  if (!body) return { ...result, bodyStatus: 'non_object' };
  return { ...result, bodyStatus: 'json', ...parameterDetails(body) };
};

/** 只观察 fetch 的实际参数，不消费 Request body，也不保存请求原文。 */
export class AiGenerationHttpRequestDiagnostics {
  private attempts = 0;
  private first: Details | undefined;

  observe(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
    this.attempts = Math.min(Number.MAX_SAFE_INTEGER, this.attempts + 1);
    if (this.first) return;
    try {
      this.first = {
        ...emptyDetails(),
        ...transportDetails(input, init),
        ...bodyDetails(init?.body),
      };
    } catch {
      this.first = emptyDetails();
    }
  }

  snapshot(): AiGenerationHttpRequestDiagnostic | undefined {
    if (!this.first) return undefined;
    const value = {
      version: 'ai-http-request-diagnostic-v1' as const,
      boundary: 'fetch_dispatch' as const,
      attempts: this.attempts,
      omittedRequests: this.attempts - 1,
      ...this.first,
    };
    const parsed = aiGenerationHttpRequestDiagnosticSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    const bounded = aiGenerationHttpRequestDiagnosticSchema.safeParse({
      ...value,
      model: null,
      truncated: true,
    });
    return bounded.success ? bounded.data : undefined;
  }
}

export const generationFetchOptions = (
  authMode: AiAuthMode | undefined,
  diagnostics?: AiGenerationHttpRequestDiagnostics,
  observeResponse?: (response: Response) => Response,
  client?: typeof fetch,
) => {
  if (authMode !== 'none' && !diagnostics && !observeResponse && !client && !currentAiTrace()) return {};
  return {
    fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      let actual = init;
      if (authMode === 'none') {
        const headers = new Headers(init?.headers);
        for (const header of ['authorization', 'x-api-key', 'api-key']) headers.delete(header);
        actual = { ...init, headers };
      }
      diagnostics?.observe(input, actual);
      return fetchWithAiTrace(input, actual, client ?? globalThis.fetch)
        .then((response) => observeResponse?.(response) ?? response);
    },
  };
};
