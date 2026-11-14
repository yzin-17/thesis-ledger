import { expect, it } from 'vitest';
import { baselineCurrency, buildBaselineCommand } from '../src/features/account-baselines/baseline-command';

it.each([['HK','00700.HK','HKD'],['US','AAPL.US','USD'],['SH','600036.SH','CNY']])(
  '%s 股票持仓快照按明确成本币种提交，保留原始十进制', async (market, symbol, currency) => {
    const instrument = { id: '11111111-1111-4111-8111-111111111111', market, symbol,
      canonicalCode: symbol.split('.')[0]!, displayName: '受控证券', instrumentType: 'STOCK', active: true,
      generation: 1, confirmable: true, disabledReason: null };
    const command = await buildBaselineCommand({ instrument, currency: baselineCurrency(instrument,'CNY'),
      quantity: '0.1234567890123456789', cost: '12.1234567890123456789', observedAt: '2026-11-10', costIncludesFees: 'UNKNOWN' },
    { accountId: '22222222-2222-4222-8222-222222222222', id: '33333333-3333-4333-8333-333333333333',
      capturedAt: '2026-11-10T01:00:00Z', sourceTimezone: 'UTC' },async () => 'a'.repeat(64));
    expect(command.observations).toMatchObject([{ symbol, currency,
      quantity: '0.1234567890123456789', averageCost: '12.1234567890123456789' }]);
  },
);
it('国内现有账户成本口径和未选证券时的回显保持', () => {
  expect(baselineCurrency({ market: 'SH' },'USD')).toBe('USD');
  expect(baselineCurrency(null,'账户币种')).toBe('账户币种');
});
