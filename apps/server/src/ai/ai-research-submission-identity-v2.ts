import { createHash } from 'node:crypto';
import { normalizeResearchSubmissionV2 } from '@thesis-ledger/schemas';
export { normalizeResearchSubmissionV2 } from '@thesis-ledger/schemas';

export function researchSubmissionDigestV2(value: unknown) {
  const input = normalizeResearchSubmissionV2(value);
  const identity = [
    'ai-research-submission-v2',
    input.mode,
    input.scope,
    input.question,
    input.templateId ?? null,
    input.researchSettingsRevision,
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
