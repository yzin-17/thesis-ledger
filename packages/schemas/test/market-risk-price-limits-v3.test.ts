import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marketTradingStatusResponseV3Schema } from '../src/market-trading-status-v3.js';

const fixture = () => JSON.parse(readFileSync(new URL(
  '../fixtures/market-risk-price-limits-v3.response.json', import.meta.url), 'utf8')).response;
describe('风险与价格限制真实来源合同', () => {
  it('保留交易未知与独立已知维度，以及原件精确观察时钟', () => {
    const source = fixture();
    const value = marketTradingStatusResponseV3Schema.parse(source);
    expect(value).toEqual(source);
    expect(value.days[0]!.state).toBe('unknown');
    expect(value.days[0]!.dailyPriceLimit!.maxUpRatio).toBe('0.05');
    expect(value.days[2]!.riskWarning!.delisting).toBe('none');
    expect(value.sourceDocuments[0]!.observedAt).toBe('2026-10-07T06:18:28.685988+00:00');
  });
  it.each(['missingReference', 'fakeRisk', 'unknownRisk', 'negativeLimit', 'adjustedReference', 'missingDocument'])(
  '拒绝%s', (kind) => {
    const value = fixture();
    const day = value.days[0];
    if (kind === 'missingReference') delete day.sourceDocumentIds;
    else if (kind === 'fakeRisk') day.riskWarning.delisting = 'normal';
    else if (kind === 'unknownRisk') day.riskWarning = { delisting: 'unknown', other: 'unknown' };
    else if (kind === 'negativeLimit') day.dailyPriceLimit.maxUpRatio = '-0.05';
    else if (kind === 'adjustedReference') day.dailyPriceLimit.reference = 'adjustedClose';
    else value.sourceDocuments = [];
    expect(marketTradingStatusResponseV3Schema.safeParse(value).success).toBe(false);
  });
});
