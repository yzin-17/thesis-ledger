import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strategySchemaV2 } from '../src/backtest-v2.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures', name), 'utf8')) as Record<
    string,
    unknown
  >;

describe('T13 跨仓 Golden 与非目标边界', () => {
  it('解析 Exchange 与 CN NAV fixture，并保持唯一 execution instrument', () => {
    const exchange = strategySchemaV2.parse(fixture('backtest-v2.exchange.json'));
    const nav = strategySchemaV2.parse(fixture('backtest-v2.cn-nav.json'));
    expect(exchange.executionInstrument).toEqual(exchange.signalSources[0]?.asset);
    expect(exchange.execution.mode).toBe('exchange');
    expect(nav.executionInstrument).toMatchObject({ market: 'CN', assetType: 'fund' });
    expect(nav.primaryTimeframe).toBe('1d');
    expect(nav.execution.mode).toBe('nav');
  });

  it('在 Schema 层拒绝 HK/US NAV、Limit 和非目标 Risk', () => {
    const exchange = fixture('backtest-v2.exchange.json');
    const base = {
      ...exchange,
      executionInstrument: { symbol: 'FUND.US', market: 'US', assetType: 'fund' },
      signalSources: [
        {
          id: 'fund',
          asset: { symbol: 'FUND.US', market: 'US', assetType: 'fund' },
          timeframe: '1d',
          series: ['nav'],
        },
      ],
      execution: { mode: 'nav', requestTypes: ['subscribe'], timing: 'nextAvailableNav' },
    };
    expect(strategySchemaV2.safeParse(base).success).toBe(false);
    expect(
      strategySchemaV2.safeParse({
        ...exchange,
        execution: {
          mode: 'exchange',
          orderType: 'limit',
          timeInForce: 'DAY',
          timing: 'nextEligibleBarOpen',
        },
      }).success,
    ).toBe(false);
    expect(
      strategySchemaV2.safeParse({ ...exchange, risk: [{ type: 'trailingStop', percent: '0.1' }] })
        .success,
    ).toBe(false);
  });
});
