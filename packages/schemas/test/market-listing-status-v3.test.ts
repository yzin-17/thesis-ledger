import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marketTradingStatusResponseV3Schema } from '../src/market-trading-status-v3.js';

function response(day: Record<string, unknown>) {
  const sample = JSON.parse(readFileSync(new URL('../fixtures/market-trading-status-v3.response.json', import.meta.url), 'utf8')).response;
  sample.days[0] = { date: sample.days[0].date, state: 'unknown',
    sourceDocumentIds: [sample.sourceDocuments[0].id], ...day };
  return sample;
}

describe('上市阶段来源合同', () => {
  it.each(['notListed', 'initialListing', 'listed', 'delistingPeriod', 'delisted'])('阶段%s不补造全天交易状态', (listingPhase) => {
    const parsed = marketTradingStatusResponseV3Schema.parse(response({ listingPhase }));
    expect(parsed.days[0].listingPhase).toBe(listingPhase);
    expect(parsed.days[0].state).toBe('unknown');
  });
  it('明确无日限制与来源说明可冻结', () => {
    const parsed = marketTradingStatusResponseV3Schema.parse(response({ listingPhase: 'initialListing',
      noDailyPriceLimit: { reason: '首五个交易日不设日价格涨跌幅限制' } }));
    expect(parsed.days[0].noDailyPriceLimit?.reason).toContain('首五个');
  });
  it.each([
    { listingPhase: 'delisted', state: 'trading' },
    { listingPhase: 'notListed', state: 'trading' },
    { listingPhase: 'initialListing', sourceDocumentIds: undefined },
    { listingPhase: 'unknown' },
    { noDailyPriceLimit: { reason: '' } },
    { noDailyPriceLimit: { reason: '来源无日限制' }, dailyPriceLimit: {
      reference: 'previousRawClose', maxUpRatio: '0.1', maxDownRatio: '0.1' } },
  ])('拒绝矛盾或未获来源证明的维度%j', (day) => {
    expect(marketTradingStatusResponseV3Schema.safeParse(response(day)).success).toBe(false);
  });
});
