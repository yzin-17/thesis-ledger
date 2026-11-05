import { aiGenerationErrorSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import type {
  AiSdkGenerationRequest,
  AiSdkGenerationResult,
} from '../ai-sdk-generation.adapter.js';
import { AiSdkGenerationError } from '../ai-sdk-generation-facts.js';
import { currentAiTrace } from './ai-trace-context.js';
import { AiTraceUnavailableError } from './ai-trace-contract.js';
import { traceSdkErrorSnapshot } from './ai-trace-error.js';
import { aiTraceUrl } from './ai-trace-redaction.js';

const inputSchemaSnapshot = (schema: z.ZodType) => {
  try {
    return { source: 'zod_input_schema', jsonSchema: z.toJSONSchema(schema) };
  } catch {
    return { source: 'zod_input_schema', status: 'not_serializable' };
  }
};

export async function traceSdkGeneration<T>(
  input: AiSdkGenerationRequest<T>,
  work: () => Promise<AiSdkGenerationResult<T>>,
) {
  const scope = currentAiTrace();
  if (!scope) return work();
  const { trace } = scope;
  trace.addSecret(input.apiKey);
  const facts = {
    requestId: input.requestId,
    adapter: input.adapter,
    compatibilityExtensionProfile: input.compatibilityExtensionProfile,
    authMode: input.authMode,
    providerId: input.providerId,
    destination: aiTraceUrl(input.baseURL),
    model: input.model,
    messages: input.messages,
    contract: input.contract,
    schema: inputSchemaSnapshot(input.schema),
    mode: input.mode,
    transport: input.transport,
    maxOutputTokens: input.maxOutputTokens,
    requestOptions: input.requestOptions,
    reasoningEffort: input.reasoningEffort,
    reasoningEnabled: input.reasoningEnabled,
    timeout: input.timeout,
    timeoutDecision: input.timeoutDecision,
    executionIdentity: input.executionIdentity,
    adaptiveExecution: input.adaptiveExecution,
    aborted: input.signal.aborted,
    maxRetries: 0,
  };
  const normalized = (error: unknown) => {
    if (error instanceof AiSdkGenerationError && error.fact.code === 'configuration_invalid')
      return error;
    let cause: unknown = error;
    for (let depth = 0; depth < 8 && cause; depth++) {
      if (cause instanceof AiTraceUnavailableError) {
        const sent = cause.requestDispatched || trace.wasDispatched(input.requestId);
        return new AiSdkGenerationError(
          aiGenerationErrorSchema.parse({
            code: 'configuration_invalid',
            phase: 'preflight',
            summary: sent
              ? '请求 trace 无法继续，已派发请求的结果保留未知'
              : '请求 trace 存储不可用，未派发模型请求',
            externalResult: sent ? 'unknown' : 'not_sent',
            requestId: input.requestId,
          }),
          undefined,
          { cause: error },
        );
      }
      cause = cause instanceof Error ? cause.cause : undefined;
    }
    return error;
  };
  try {
    return await trace.runNode(
      'sdk.generate',
      facts,
      async () => {
        try {
          return await work();
        } catch (error) {
          throw normalized(error);
        }
      },
      {
        sdkRequestId: input.requestId,
        error: (error) => traceSdkErrorSnapshot(error, input.schema),
      },
    );
  } catch (error) {
    throw normalized(error);
  } finally {
    await trace.completeSdkRequest(input.requestId);
  }
}
