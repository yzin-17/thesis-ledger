import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { aiFrozenResearchV2Schema, researchSubmissionV2Schema } from '@thesis-ledger/schemas';
import type { AiResearchSubmissionV2Execution } from '../../src/ai/ai-research-submission-v2.store.js';
import { loadAiResearchPolicy } from '../../src/ai/ai-research-policy.js';

export function submissionV2Fixture() {
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
      'utf8',
    ),
  ) as { input: unknown; frozen: unknown };
  const input = researchSubmissionV2Schema.parse(sample.input);
  const frozen = aiFrozenResearchV2Schema.parse(sample.frozen);
  input.submissionId = randomUUID();
  frozen.request = structuredClone(input);
  return { input, frozen };
}

export function submissionV2Execution(): AiResearchSubmissionV2Execution {
  return {
    provider: 'controlled-provider',
    model: 'controlled-model',
    sdkExecution: {
      version: 'sdk-execution-v1',
      contract: { id: 'research', version: 'research-generation-v2' },
      frozenPolicy: loadAiResearchPolicy(),
      deadlineAt: '2026-10-19T00:10:00Z',
      generationStatus: 'pending',
      usageCompleteness: 'unknown',
      requests: [],
      continuationBlockedReason: null,
    },
  };
}
