import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lifecycleRunIssuesV3 } from '../src/backtest-lifecycle-preparation-v3.js';
const value = () => ({
  startDate: '2026-05-10',
  endDate: '2026-05-22',
  executionPriceProtocol: { history: { basis: 'fixed-provider-snapshot' } },
  executionModel: { scope: { market: 'CN', symbol: '000995.SZ', instrumentType: 'STOCK' } },
  frozenExecutionWindow: { responseHash: 'b'.repeat(64) },
  lifecyclePreparation: {
    version: 'listed-bars-warmup-v1' as const,
    response: JSON.parse(
      readFileSync(
        new URL('../fixtures/market-basic-lifecycle-v3.response.json', import.meta.url),
        'utf8',
      ),
    ).response,
    inputHash: 'a'.repeat(64),
    priceResponseHash: 'b'.repeat(64),
    requiredWarmupBars: 2,
    signalStartDate: '2026-05-20',
  },
});
describe('新生命周期研究合同保持旧入口与独立价格证明', () => {
  it('旧配置无新协议时无追加要求，新协议绑定请求与两类来源', () => {
    const input = value();
    expect(lifecycleRunIssuesV3(input)).toEqual([]);
    delete (input as Partial<typeof input>).lifecyclePreparation;
    expect(lifecycleRunIssuesV3(input)).toEqual([]);
  });
  it.each(['strict', 'price', 'symbol', 'range', 'start', 'unknown'])(
    '拒绝不一致的 %s',
    (field) => {
      const input = value();
      if (field === 'strict') input.executionPriceProtocol.history.basis = 'point-in-time';
      if (field === 'price') input.lifecyclePreparation.priceResponseHash = 'c'.repeat(64);
      if (field === 'symbol') input.executionModel.scope.symbol = '600221.SH';
      if (field === 'range') input.lifecyclePreparation.response.range.end = '2026-05-23';
      if (field === 'start') input.lifecyclePreparation.signalStartDate = '2026-05-17';
      if (field === 'unknown')
        Object.assign(input.lifecyclePreparation.response.basicLifecycle!, {
          ipoDate: null,
          ipoDateStatus: 'notProvided',
        });
      expect(lifecycleRunIssuesV3(input).length).toBeGreaterThan(0);
    },
  );
});
