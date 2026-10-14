import { describe, expect, it } from 'vitest';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { knownCashRunFixture } from './known-cash-test-fixtures.js';

describe('版本化现金参考预热缓冲', () => {
  it('新标记扩展周一取数，原请求起点/所需交易日数和未标记旧规则保持', async () => {
    const f = await knownCashRunFixture();
    const config = { ...f.runConfig, startDate: '2025-06-16' };
    const options = { cashEventResearch: config.executionPriceProtocol.cashEventResearch };
    const old = planBacktestPriceInputs(f.strategy, config, options);
    const next = planBacktestPriceInputs(
      f.strategy,
      { ...config, frozenPriceWarmupPolicy: 'cash-reference-calendar-buffer-v1' },
      options,
    );
    expect(config.startDate).toBe('2025-06-16');
    expect(old.warmup).toMatchObject({
      startDate: '2025-06-14',
      lookbackPeriods: 1,
      calendarBufferDays: 0,
    });
    expect(next.warmup).toMatchObject({
      startDate: '2025-06-07',
      lookbackPeriods: 1,
      calendarBufferDays: 7,
      rangePolicyVersion: 'cash-reference-calendar-buffer-v1',
    });
    expect(
      planBacktestPriceInputs(f.strategy, config, {
        ...options,
        priceWarmupPolicy: 'cash-reference-calendar-buffer-v1',
      }).warmup,
    ).toEqual(next.warmup);
  });
});
