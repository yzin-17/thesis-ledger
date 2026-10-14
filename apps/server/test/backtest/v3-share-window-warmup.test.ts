import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strategySchema, executionPriceProtocolSchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';

const fixture = (name: string) => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8',
));
function input() {
  const raw = fixture('backtest-v2.exchange.json');
  const asset = { market: 'US', symbol: 'GME.US', assetType: 'stock' };
  raw.executionInstrument = asset;
  raw.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
  const series = { type: 'series', sourceId: 'execution', field: 'close' };
  raw.entry = { type: 'compare', operator: 'lte', left: series,
    right: { type: 'indicator', name: 'MA', input: series, params: { period: 2 } } };
  raw.exit = { type: 'positionState', field: 'isOpen' };
  const protocol = fixture('execution-price.raw-events.json');
  protocol.history = { basis: 'fixed-provider-snapshot' };
  protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  return { strategy: strategySchema.parse(raw) as BacktestStrategy, config: {
    startDate: '2024-05-14', endDate: '2024-05-24', baseCurrency: 'USD' as const,
    executionPriceProtocol: executionPriceProtocolSchema.parse(protocol),
  } };
}
describe('有界整股窗口候选预热计划', () => {
  it('准备候选与冻结计划使用同一版本，仍要求两会话和已核对日历', () => {
    const { strategy, config } = input();
    const plan = planBacktestPriceInputs(strategy, config);
    expect(plan.warmup).toMatchObject({ startDate: '2024-05-10', lookbackPeriods: 2,
      calendarBufferDays: 0, rangePolicyVersion: 'whole-share-window-calendar-budget-v1',
      requiresVerifiedSessionCalendar: true });
    const { executionPriceProtocol: _protocol, ...preparation } = config;
    void _protocol;
    expect(planBacktestPriceInputs(strategy, preparation, {
      marketRuleResearch: config.executionPriceProtocol.marketRuleResearch,
      minimumWarmupSessions: 2,
    }).warmup).toEqual(plan.warmup);
    expect(planBacktestPriceInputs(strategy, { ...config, frozenWarmupBudgetSessions: 1 }).blockingIssues).not.toHaveLength(0);
  });
  it('无显式研究标记、其他证券或市场保留14日缓冲', () => {
    const { strategy, config } = input();
    const protocol = { ...config.executionPriceProtocol }; delete protocol.marketRuleResearch;
    expect(planBacktestPriceInputs(strategy, { ...config, executionPriceProtocol: protocol }).warmup.calendarBufferDays).toBe(14);
    const other = { ...strategy, executionInstrument: { ...strategy.executionInstrument, symbol: 'AAPL.US' } };
    expect(planBacktestPriceInputs(other, config).warmup.calendarBufferDays).toBe(14);
    expect(planBacktestPriceInputs({ ...strategy, executionInstrument: {
      ...strategy.executionInstrument, symbol: '600000.SH', market: 'CN',
    } }, config).warmup.calendarBufferDays).toBe(14);
  });
});
