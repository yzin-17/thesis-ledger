import type { z } from 'zod';
import { arenaLiveDecisionSchema } from '@thesis-ledger/schemas';
import type { liveCallFailureDiagnostics } from './live-call-diagnostics.js';

export class LiveInvalidDecisionError extends Error {
  constructor(readonly reply: string, readonly issues: { path: PropertyKey[]; message: string }[]) {
    super('model_output_invalid');
    this.name = 'LiveInvalidDecisionError';
  }
}

/** 只描述完整 JSON 决策的拒绝；用量和身份由调用方另行核验。 */
export function invalidDecisionForCorrection(
  fact: { code: string; externalResult: string },
  diagnostics: ReturnType<typeof liveCallFailureDiagnostics>,
  schema: z.ZodType,
) {
  if (fact.code !== 'schema_invalid' || fact.externalResult !== 'complete' ||
    diagnostics.finishReason !== 'stop' || diagnostics.truncated || !diagnostics.outputText) return null;
  try {
    const reply: unknown = JSON.parse(diagnostics.outputText);
    if (!reply || typeof reply !== 'object' || !('action' in reply) || reply.action !== 'decision' ||
      !('decision' in reply) || !reply.decision || typeof reply.decision !== 'object') return null;
    const current = schema.safeParse(reply);
    if (current.success) return null;
    const business = arenaLiveDecisionSchema.safeParse(reply.decision);
    const issues = business.success ? current.error.issues : business.error.issues.map(issue =>
      ({ ...issue, path: ['decision', ...issue.path] }));
    return new LiveInvalidDecisionError(diagnostics.outputText, issues.slice(0, 12).map(issue =>
      ({ path: issue.path, message: issue.message.slice(0, 180) })));
  } catch { return null; }
}
