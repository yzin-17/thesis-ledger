import { createHash } from 'node:crypto';
import { NoObjectGeneratedError, NoOutputGeneratedError } from 'ai';
import {
  aiGenerationErrorSchema,
  aiGenerationFailureDiagnosticSchema,
  type AiGenerationContractRef,
  type AiGenerationMode,
  type AiGenerationFailureDiagnostic,
  type AiGenerationRuntimeDiagnostic,
  type AiGenerationHttpRequestDiagnostic,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import { generationStructuralPreview as structuralPreview } from './ai-generation-structural-preview.js';
import {
  AiSdkGenerationError,
  sanitize,
  type AiGenerationCompletion,
} from './ai-sdk-generation-facts.js';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const outputError = (error: unknown) => {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (NoObjectGeneratedError.isInstance(current)) return current;
    current = asRecord(current)?.cause;
  }
  return null;
};

const jsonShape = (
  text: string,
): Pick<AiGenerationFailureDiagnostic, 'jsonStatus' | 'jsonRootType'> => {
  if (text.length > 65_536) return { jsonStatus: 'not_checked_oversize', jsonRootType: null };
  if (!text.trim()) return { jsonStatus: 'empty', jsonRootType: null };
  try {
    const value: unknown = JSON.parse(text);
    let root: AiGenerationFailureDiagnostic['jsonRootType'] = null;
    if (value === null) root = 'null';
    else if (Array.isArray(value)) root = 'array';
    else if (typeof value === 'object') root = 'object';
    else if (typeof value === 'string') root = 'string';
    else if (typeof value === 'number') root = 'number';
    else if (typeof value === 'boolean') root = 'boolean';
    return { jsonStatus: 'valid', jsonRootType: root };
  } catch {
    return { jsonStatus: 'invalid', jsonRootType: null };
  }
};

export const generationFailureDiagnostic = (
  error: unknown,
  mode: AiGenerationMode,
  runtime?: AiGenerationRuntimeDiagnostic,
  httpRequest?: AiGenerationHttpRequestDiagnostic,
  completion?: AiGenerationCompletion,
  responseText?: string,
): AiGenerationFailureDiagnostic => {
  const source = outputError(error);
  const text = source?.text ?? responseText;
  const model = source?.response?.modelId ?? completion?.actualModel;
  const safeModel = safeActualModel(model);
  const errorClass = generationErrorClass(error, Boolean(source));
  return aiGenerationFailureDiagnosticSchema.parse({
    version: 'ai-failure-diagnostic-v1',
    ...(runtime ? { runtime } : {}),
    ...(httpRequest ? { httpRequest } : {}),
    errorClass,
    generationMode: mode,
    finishReason: source?.finishReason ?? completion?.finishReason ?? null,
    actualModel: safeModel,
    outputCharacters: typeof text === 'string' ? text.length : null,
    outputSha256: typeof text === 'string' ? createHash('sha256').update(text).digest('hex') : null,
    ...(typeof text === 'string'
      ? { ...jsonShape(text), ...structuralPreview(text) }
      : { jsonStatus: 'missing', jsonRootType: null, structuralPreview: null, truncated: false }),
  });
};

export const schemaGenerationFailure = (
  error: unknown,
  input: { requestId: string; contract: AiGenerationContractRef; mode: AiGenerationMode },
  usage: AiUsageFacts,
  runtime?: AiGenerationRuntimeDiagnostic,
  httpRequest?: AiGenerationHttpRequestDiagnostic,
  completion?: AiGenerationCompletion,
) => {
  const researchV2 =
    input.contract.id === 'research' && input.contract.version === 'research-report-generation-v1';
  return new AiSdkGenerationError(
    aiGenerationErrorSchema.parse({
      code: 'schema_invalid',
      phase: 'validation',
      externalResult: 'complete',
      requestId: input.requestId,
      summary: researchV2 ? '结构化响应未通过解析或契约校验' : sanitize(error),
      ...(researchV2 || completion
        ? {
            diagnostic: generationFailureDiagnostic(
              error,
              input.mode,
              runtime,
              httpRequest,
              completion,
            ),
          }
        : {}),
    }),
    usage,
    { cause: error, completion },
  );
};

/** 结构化失败以外的终止也保留同一请求的安全运行诊断，不改变错误码与用量。 */
export const withGenerationRuntimeDiagnostic = (
  error: AiSdkGenerationError,
  mode: AiGenerationMode,
  runtime?: AiGenerationRuntimeDiagnostic,
  httpRequest?: AiGenerationHttpRequestDiagnostic,
  completion: AiGenerationCompletion | undefined = error.completion,
) => {
  if (!runtime && !httpRequest && completion === error.completion) return error;
  return new AiSdkGenerationError(
    aiGenerationErrorSchema.parse({
      ...error.fact,
      diagnostic: {
        ...(error.fact.diagnostic ??
          generationFailureDiagnostic(error, mode, undefined, undefined, completion)),
        ...(runtime ? { runtime } : {}),
        ...(httpRequest ? { httpRequest } : {}),
      },
    }),
    error.usage,
    { cause: error, completion },
  );
};

function safeActualModel(model: unknown) {
  return typeof model === 'string' &&
    /^[A-Za-z0-9_.:/-]{1,200}$/u.test(model) &&
    !/(?:sk-|bearer|api[_-]?key)/iu.test(model)
    ? model
    : null;
}

function generationErrorClass(
  error: unknown,
  hasOutputError: boolean,
): AiGenerationFailureDiagnostic['errorClass'] {
  if (hasOutputError) return 'no_object';
  if (NoOutputGeneratedError.isInstance(error)) return 'no_output';
  if (error instanceof SyntaxError) return 'syntax';
  if (error instanceof Error && error.name === 'ZodError') return 'schema';
  return 'unknown';
}
