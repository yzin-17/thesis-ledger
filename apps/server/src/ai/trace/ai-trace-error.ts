import { createHash } from 'node:crypto';
import { NoObjectGeneratedError } from 'ai';
import type { z } from 'zod';

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

export const traceErrorSnapshot = (error: unknown) => {
  const value = asRecord(error);
  return {
    errorClass: error instanceof Error ? error.name : 'unknown',
    message: error instanceof Error ? error.message : '未知错误',
    ...(value?.fact ? { fact: value.fact } : {}),
  };
};

export function traceSdkErrorSnapshot(error: unknown, schema: z.ZodType) {
  let current: unknown = error;
  let output: NoObjectGeneratedError | null = null;
  const causes: Array<{ errorClass: string; message: string; issues?: unknown }> = [];
  for (let depth = 0; depth < 6 && current; depth++) {
    if (NoObjectGeneratedError.isInstance(current)) output = current;
    if (current instanceof Error) {
      const issues = asRecord(current)?.issues;
      causes.push({
        errorClass: current.name,
        message: current.message.slice(0, 2000),
        ...(Array.isArray(issues)
          ? {
              issues: issues
                .slice(0, 64)
                .map((issue) => ({ code: asRecord(issue)?.code, path: asRecord(issue)?.path })),
            }
          : {}),
      });
    }
    current = asRecord(current)?.cause;
  }
  const text = output?.text;
  let independentContractCheck: unknown = { status: 'missing' };
  if (typeof text === 'string') {
    try {
      const parsed: unknown = JSON.parse(text);
      const result = schema.safeParse(parsed);
      independentContractCheck = {
        source: 'independent_check_after_sdk_error',
        jsonStatus: 'valid',
        schemaAccepted: result.success,
        issueCount: result.success ? 0 : result.error.issues.length,
        issuesTruncated: !result.success && result.error.issues.length > 64,
        issues: result.success
          ? []
          : result.error.issues
              .slice(0, 64)
              .map((issue) => ({ code: issue.code, path: issue.path })),
      };
    } catch (e) {
      independentContractCheck = {
        source: 'independent_check_after_sdk_error',
        jsonStatus: e instanceof SyntaxError ? 'invalid' : 'unknown',
        schemaAccepted: false,
      };
    }
  }
  return {
    ...traceErrorSnapshot(error),
    usage: asRecord(error)?.usage ?? null,
    causes,
    ...(typeof text === 'string'
      ? {
          sdkOutputText: text,
          sdkOutputCharacters: text.length,
          sdkOutputSha256: createHash('sha256').update(text).digest('hex'),
        }
      : {}),
    ...(output?.response
      ? { response: { id: output.response.id, modelId: output.response.modelId } }
      : {}),
    independentContractCheck,
  };
}
