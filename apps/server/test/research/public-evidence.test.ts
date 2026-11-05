import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { MarketNewsRequestV3, MarketNewsResponseV3 } from '@thesis-ledger/schemas';
import { marketNewsResult } from '../../src/market/market-news-contract.js';
import { newsResearchEvidence } from '../../src/research/research-public-evidence.js';
import { sealAiFrozenResearchV2, verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { submissionV2Fixture } from '../ai/research-submission-v2.fixture.js';

const samples = JSON.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/news-search-v1.samples.json', import.meta.url), 'utf8')) as { samples: Array<{ name: string; request: MarketNewsRequestV3; response: MarketNewsResponseV3 | null }> };
const cutoff = '2026-10-19T12:00:00Z';
function material(name: string, required = true) {
  const sample = samples.samples.find((value) => value.name === name);
  if (!sample?.response) throw new Error('共享新闻样例缺失');
  return newsResearchEvidence(marketNewsResult(sample.request, sample.response), required, cutoff);
}
it.each(['available','partial_failure','unknown_published_time','untrusted_source_text'])('真实新闻准备输出可被执行端实际可用性消费：%s', (name) => {
  const { frozen } = submissionV2Fixture();
  frozen.evidence = material(name);
  frozen.preparedAt = cutoff;
  frozen.dataCutoffAt = cutoff;
  const reasons = [...new Set(frozen.evidence.flatMap((entry) => entry.reasons))];
  frozen.quality = { status: reasons.length ? 'partial' : 'complete', reasons };
  expect(verifyAiFrozenResearchV2(sealAiFrozenResearchV2(frozen)).evidence.some((entry) => entry.usable)).toBe(true);
});
it.each(['empty','not_admitted','ambiguous_source_identity'])('空或不可用新闻不贡献可用证据，来源原因保留：%s', (name) => {
  const entries = material(name);
  expect(entries.some((entry) => entry.usable)).toBe(false);
  expect(entries[0]).toMatchObject({ required: true, status: 'unavailable', data: null });
  if (name === 'not_admitted') expect(entries[0]!.reasons).toContain('news_not_admitted');
});
it('未知发布时间保留为空和部分质量，不用抓取时间补填', () => {
  const entries = material('unknown_published_time');
  expect(entries[0]!.audit.publishedAt).toBeNull();
  expect(entries[0]!.status).toBe('partial');
  expect(entries[0]!.reasons).toContain('news_published_time_unrecorded');
});
