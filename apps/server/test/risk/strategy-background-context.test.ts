import { describe, expect, it, vi } from 'vitest';
import {
  compileStrategyMonitoringPlan,
  evaluateStrategyMonitoringPlan,
} from '@thesis-ledger/domain';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { controlledMarketSession } from '../market/market-session.fixture.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-11-12T09:00:00Z');
const target = {
  executionInstrument: { symbol: '00700.HK', assetType: 'stock', market: 'HK' },
  primaryTimeframe: '1d',
  requiresHoldingPeriods: true,
};
const plan = compileStrategyMonitoringPlan(
  {
    ...target,
    risk: [
      { type: 'fixedStop', percent: '0.03' },
      { type: 'maxHoldingPeriod', periods: 10 },
    ],
  },
  'fixture',
);
function harness(
  position: unknown = { id: 'position', quantity: '100', costPrice: '100' },
  trade: unknown = null,
) {
  const db = {
    account: { findUnique: async () => ({ active: true, mode: 'actual', type: 'securities' }) },
    position: { findUnique: async () => position },
    trade: { findFirst: async () => trade },
  };
  const readV3 = vi.fn();
  const read = vi.fn(async () => ({
    status: 'selected',
    selection: {
      response: {
        bars: [
          {
            timestamp: '2026-11-12T00:00:00Z',
            availableAt: '2026-11-12T08:00:00Z',
            open: 90,
            high: 90,
            low: 90,
            close: 90,
            volume: 100,
            amount: 9000,
            completionStatus: 'complete',
          },
        ],
        provenance: { providerId: 'fixture' },
      },
    },
  }));
  const market = { getSession: controlledMarketSession };
  const service = () =>
    new StrategyRiskContextService(
      db as never,
      { readV3 } as never,
      market as never,
      { read } as never,
    );
  const load = async (selectedTarget = target) =>
    service().load(accountId, '00700.HK', selectedTarget, at, true);
  return { read, readV3, market, load };
}

describe('自动策略上下文缺数诊断', () => {
  it.each([null, { id: 'position', quantity: '0', costPrice: '100' }])(
    '无实际有效持仓时不获取行情：%j',
    async (position) => {
      const h = harness(position);
      const actual = await h.load();
      const evaluation = evaluateStrategyMonitoringPlan(plan, actual.context);
      expect(evaluation[0]?.reasonCode).toBe(position ? 'position_empty' : 'position_missing');
      expect(h.read).not.toHaveBeenCalled();
      expect(h.readV3).not.toHaveBeenCalled();
    },
  );
  it('缺开仓时间只影响持有周期，成本止损仍可判断；成本为零单独说明', async () => {
    const h = harness();
    const actual = await h.load();
    expect(h.read).toHaveBeenCalledOnce();
    expect(h.readV3).not.toHaveBeenCalled();
    expect(evaluateStrategyMonitoringPlan(plan, actual.context)).toEqual([
      expect.objectContaining({ state: 'triggered' }),
      expect.objectContaining({ reasonCode: 'holding_start_missing' }),
    ]);
    const zero = await harness({ id: 'position', quantity: '100', costPrice: '0' }).load();
    expect(evaluateStrategyMonitoringPlan(plan, zero.context)[0]?.reasonCode).toBe(
      'average_cost_invalid',
    );
  });
  it('交易日历未知时直接说明且不发请求；分钟线不借用盘中报价', async () => {
    const h = harness();
    h.market.getSession = vi.fn(async () => ({ state: 'unknown' })) as never;
    expect((await h.load()).context.inputIssue?.code).toBe('calendar_unavailable');
    expect(h.read).not.toHaveBeenCalled();
    expect((await h.load({ ...target, primaryTimeframe: '5m' })).context.inputIssue?.code).toBe(
      'timeframe_unsupported',
    );
    expect(h.read).not.toHaveBeenCalled();
  });
  it('来源未选与来源请求失败保留不同原因', async () => {
    const h = harness();
    h.read.mockResolvedValueOnce({
      status: 'unavailable',
      selection: { reason: 'route_not_configured' },
    } as never);
    expect((await h.load()).context.inputIssue).toEqual({
      code: 'daily_bars_route_not_configured',
      reason: '尚未选择日线数据来源',
    });
    h.read.mockRejectedValueOnce(new Error('受控未知故障'));
    await expect(h.load()).rejects.toThrow('受控未知故障');
  });
});
