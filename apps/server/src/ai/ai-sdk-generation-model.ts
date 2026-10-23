import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible, type MetadataExtractor } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { aiGenerationErrorSchema } from '@thesis-ledger/schemas';
import { AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1 } from './ai-provider-upstream.js';
import { AiSdkGenerationError } from './ai-sdk-generation-facts.js';
import type { AiSdkGenerationRequest } from './ai-sdk-generation.adapter.js';
import type { AiGenerationStreamDiagnostics } from './ai-generation-stream-diagnostics.js';

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

const compatibleMetadataExtractor = (
  diagnostics: AiGenerationStreamDiagnostics | undefined,
  openRouter: boolean,
): MetadataExtractor => ({
  extractMetadata: ({ parsedBody }) =>
    Promise.resolve(openRouter ? openRouterCostMetadata(parsedBody) : undefined),
  createStreamExtractor: () => {
    let metadata: ReturnType<typeof openRouterCostMetadata>;
    return {
      processChunk: (parsedChunk) => {
        diagnostics?.observeProviderChunk(parsedChunk);
        if (openRouter) metadata = openRouterCostMetadata(parsedChunk) ?? metadata;
      },
      buildMetadata: () => metadata,
    };
  },
});

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

export const createGenerationModel = <OUTPUT>(
  input: AiSdkGenerationRequest<OUTPUT>,
  diagnostics?: AiGenerationStreamDiagnostics,
): LanguageModel => {
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
    ...(diagnostics ||
    compatibilityProfile(input) === AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1
      ? {
          metadataExtractor: compatibleMetadataExtractor(
            diagnostics,
            compatibilityProfile(input) === AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
          ),
        }
      : {}),
  }).chatModel(input.model);
};
