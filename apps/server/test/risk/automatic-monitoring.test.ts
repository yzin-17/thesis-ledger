import { describe, expect, it, vi } from 'vitest';
import { RiskMonitoringService } from '../../src/risk/risk-monitoring.service.js';
import type { ObservedMarketValue } from '../../src/market/market-observations.service.js';
const at = new Date('2026-11-06T07:00:00Z');
const observed = (price: number, time = at.toISOString()) =>
  ({
    sourceTime: time,
    fingerprint: `${time}:${price}`,
    observation: {
      kind: 'quote',
      value: {
        symbol: '600519.SH',
        price,
        freshness: 'live',
        marketTime: time,
        fetchedAt: time,
        stale: false,
      },
    },
  }) as ObservedMarketValue;
const rule = {
  id: 'rule-1',
  version: 1,
  kind: 'price-below',
  sourcePlanId: null as string | null,
  scope: 'security',
  symbol: '600519.SH',
  accountId: null,
};
function harness() {
  let stored: string | null = null;
  let locked: string | null = null;
  let rules: (typeof rule)[] = [];
  const events: Array<[string, string[]]> = [];
  const client = {
    get: vi.fn(async (key: string) => (key.includes('lock') ? locked : stored)),
    set: vi.fn(async (_key: string, token: string) => {
      if (locked) return null;
      locked = token;
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, count: number, ...args: string[]) => {
      if (count === 3) {
        stored = args[4]!;
        return 1;
      }
      locked = null;
      return 1;
    }),
    hset: vi.fn(async () => 1),
    xrevrange: vi.fn(async () => events.slice(-1).reverse()),
    xrange: vi.fn(async (_key: string, after: string) => {
      if (after === '-') return events.slice(0, 1);
      return events.filter(
        ([id]) => BigInt(id.split('-')[0]!) > BigInt(after.slice(1).split('-')[0]!),
      );
    }),
  };
  const observations = { snapshots: vi.fn(async () => [observed(110)]) };
  const strategyRun = vi.fn(async () => undefined);
  const scan = vi.fn<
    (
      contexts: unknown,
      options: unknown,
    ) => Promise<{ results: Array<{ eventId?: string; error?: string; errorCode?: string }> }>
  >(async () => ({ results: [] }));
  const build = vi.fn(
    async (
      mode: string,
      _time: string,
      source: { getQuote(symbol: string): Promise<{ price: number }> },
    ) => ({
      contexts: [
        {
          symbol: '600519.SH',
          dataQuality: {},
          mode,
          price: (await source.getQuote('600519.SH')).price,
        },
      ],
    }),
  );
  const create = () =>
    new RiskMonitoringService(
      observations as never,
      { client } as never,
      { listEnabledRules: async () => rules } as never,
      { scan } as never,
      { build } as never,
      { runNow: strategyRun } as never,
    );
  return {
    create,
    scan,
    build,
    client,
    observations,
    strategyRun,
    setRules: (next: (typeof rule)[]) => {
      rules = next;
    },
    trim: () => {
      events.splice(0);
    },
    emit: (id: string, row: ObservedMarketValue) =>
      events.push([id, ['observation', JSON.stringify(row)]]),
  };
}

describe('rule-driven automatic monitoring', () => {
  it('没有报价事件时仍调度策略规则，且不进入普通规则或模拟扫描', async () => {
    const h = harness();
    h.setRules([{ ...rule, sourcePlanId: 'application' }]);
    await h.create().runNow(at);
    await h.create().runNow(new Date(at.getTime() + 1000));
    expect(h.strategyRun).toHaveBeenCalledTimes(2);
    expect(h.strategyRun).toHaveBeenCalledWith([expect.objectContaining({ sourcePlanId: 'application' })], at);
    expect(h.scan).not.toHaveBeenCalled();
    expect(h.build).not.toHaveBeenCalled();
  });
  it('newly enabled rules get an initial evaluation; unchanged data does not rescan', async () => {
    const h = harness();
    const monitor = h.create();
    await monitor.runNow(at);
    expect(h.scan).not.toHaveBeenCalled();
    h.setRules([rule]);
    await monitor.runNow(at);
    expect(h.scan).toHaveBeenCalledTimes(2);
    expect(h.scan).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ includeStrategyRules: false, ruleIds: ['rule-1'] }),
    );
    await monitor.runNow(at);
    await h.create().runNow(at);
    expect(h.scan).toHaveBeenCalledTimes(2);
  });
  it('consumes each observed crossing in order and skips out-of-order source data', async () => {
    const h = harness();
    h.setRules([rule]);
    const monitor = h.create();
    await monitor.runNow(at);
    h.scan.mockClear();
    h.emit('1-0', observed(90));
    h.emit('2-0', observed(110, '2026-11-06T07:00:01Z'));
    h.emit('3-0', observed(80, '2026-11-06T06:59:00Z'));
    await monitor.runNow(new Date('2026-11-06T07:00:02Z'));
    expect(
      h.scan.mock.calls.map(([contexts]) =>
        (contexts as Array<{ mode: string; price: number }>).map(({ mode, price }) => ({
          mode,
          price,
        })),
      ),
    ).toEqual([
      [{ mode: 'actual', price: 90 }],
      [{ mode: 'shadow', price: 90 }],
      [{ mode: 'actual', price: 110 }],
      [{ mode: 'shadow', price: 110 }],
    ]);
  });
  it('rule revisions re-evaluate; disabled/archived/ineligible rules do not scan on updates', async () => {
    const h = harness();
    h.setRules([rule]);
    const monitor = h.create();
    await monitor.runNow(at);
    h.scan.mockClear();
    h.setRules([{ ...rule, version: 2 }]);
    await monitor.runNow(at);
    expect(h.scan).toHaveBeenCalledTimes(2);
    h.scan.mockClear();
    h.setRules([]);
    h.emit('1-0', observed(80));
    await monitor.runNow(at);
    expect(h.scan).not.toHaveBeenCalled();
  });
  it('strategy and indicator rules never cause an implicit remote bar request', async () => {
    const h = harness();
    h.setRules([{ ...rule, kind: 'ma' }]);
    await h.create().runNow(at);
    expect(h.scan).not.toHaveBeenCalled();
    expect(h.build).not.toHaveBeenCalled();
  });
  it('discloses a retained-journal gap and resumes from available snapshots', async () => {
    const h = harness();
    h.setRules([rule]);
    const monitor = h.create();
    await monitor.runNow(at);
    h.emit('1-0', observed(90));
    await monitor.runNow(at);
    h.trim();
    h.emit('3-0', observed(80));
    await monitor.runNow(at);
    expect(h.client.hset).toHaveBeenCalledWith(expect.any(String), 'gapAt', at.toISOString());
    expect(h.observations.snapshots).toHaveBeenCalledTimes(2);
  });

  it('reports missing valuation inputs without treating them as a processor failure', async () => {
    const h = harness();
    h.setRules([rule]);
    const monitor = h.create();
    h.scan.mockResolvedValueOnce({
      results: [{ error: '必要汇率不可用', errorCode: 'input-unavailable' }],
    });
    await monitor.runNow(at);
    expect(h.client.hset).toHaveBeenCalledWith(
      expect.any(String),
      'inputUnavailable',
      '1',
      'inputReason',
      '必要汇率不可用',
    );
    h.scan.mockClear();
    await monitor.runNow(at);
    expect(h.scan).not.toHaveBeenCalled();
  });

  it('does not acknowledge a database/evaluation failure without an event ID', async () => {
    const h = harness();
    h.setRules([rule]);
    const monitor = h.create();
    await monitor.runNow(at);
    h.scan.mockClear();
    h.emit('1-0', observed(80));
    h.scan.mockResolvedValueOnce({ results: [{ error: 'database temporarily unavailable' }] });
    await monitor.runNow(at);
    h.scan.mockClear();
    await h.create().runNow(at);
    expect(h.scan).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge an event when notification enqueue failed; recovers after restart', async () => {
    const h = harness();
    h.setRules([rule]);
    const monitor = h.create();
    await monitor.runNow(at);
    h.scan.mockClear();
    h.emit('1-0', observed(80));
    h.scan.mockResolvedValueOnce({
      results: [{ eventId: 'existing-event', error: 'enqueue failed' }],
    });
    await monitor.runNow(at);
    expect(h.client.hset).toHaveBeenCalled();
    h.scan.mockClear();
    await h.create().runNow(at);
    expect(h.scan).toHaveBeenCalledTimes(2);
  });
});
