import type { z } from 'zod';
import { traceSdkErrorSnapshot } from '../../ai/trace/ai-trace-error.js';
import { redactAiTrace } from '../../ai/trace/ai-trace-redaction.js';

const maximumOutputCharacters = 65_536;

export function liveCallFailureDiagnostics(error: unknown, schema: z.ZodType, apiKey: string) {
  const snapshot = traceSdkErrorSnapshot(error, schema);
  const text = snapshot.sdkOutputText;
  const redacted = redactAiTrace(text, new Set([apiKey]));
  return {
    outputText: typeof redacted === 'string' ? redacted.slice(0, maximumOutputCharacters) : null,
    outputCharacters: snapshot.sdkOutputCharacters ?? null,
    outputSha256: snapshot.sdkOutputSha256 ?? null,
    truncated: typeof redacted === 'string' && redacted.length > maximumOutputCharacters,
    contractCheck: snapshot.independentContractCheck,
    response: snapshot.response ?? null,
  };
}
