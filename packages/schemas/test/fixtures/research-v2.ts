import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { aiFrozenResearchV2Schema } from '../../src/ai-frozen-research-v2.js';
import { researchSubmissionV2Schema } from '../../src/research-scope-v2.js';
import {
  researchGenerationV2Schema,
  researchResultV2Schema,
} from '../../src/research-result-v2.js';

/** 合成序列化样例；指纹为合同占位值，不是实源或模型执行证据。 */
export function researchV2Fixture() {
  const sample = JSON.parse(
    readFileSync(new URL('../../fixtures/research-v2.samples.json', import.meta.url), 'utf8'),
  ) as {
    input: unknown;
    frozen: unknown;
    generation: unknown;
    result: unknown;
    instrumentId: unknown;
    evidenceId: unknown;
    toolCallId: unknown;
  };
  return {
    input: researchSubmissionV2Schema.parse(sample.input),
    frozen: aiFrozenResearchV2Schema.parse(sample.frozen),
    generation: researchGenerationV2Schema.parse(sample.generation),
    result: researchResultV2Schema.parse(sample.result),
    instrumentId: z.uuid().parse(sample.instrumentId),
    evidenceId: z.uuid().parse(sample.evidenceId),
    toolCallId: z.uuid().parse(sample.toolCallId),
  };
}
