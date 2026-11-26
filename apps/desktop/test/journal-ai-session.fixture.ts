import { researchResultV2Schema } from '@thesis-ledger/schemas';
import sample from '../../../packages/schemas/fixtures/research-v2.samples.json';

export function journalExplanationResult(conclusion: string) {
  const result = researchResultV2Schema.parse(sample.result);
  return { ...result, inference: { ...result.inference, conclusion } };
}

export const journalSessionRun = {
  id: '00000000-0000-4000-8000-000000000099',
  provider: '验收 Provider',
  model: '验收模型',
  promptVersion: '验收-v2',
  algorithmVersion: 'journal-test',
  status: 'succeeded' as const,
  errorSummary: null,
  result: journalExplanationResult('只解读已核对的事实'),
};
