import { describe, expect, it } from 'vitest';
import { projectBacktestTradeMarkers } from '../src/features/strategy/backtest-trade-markers.model';

const point = (time: string) => ({ time: Date.parse(time) });
const fill = (occurredAt: string, side = 'buy', fillId = occurredAt) => ({
  fillId, occurredAt, side, executionSymbol: 'AAPL.US',
  quantity: '0.12345678901234567890123456789', price: '12345678901234567890.123456789',
});

describe('回测成交在已有序列时点上的展示投影', () => {
  it('日线使用来源时区的同日价格，保留零点日期且不跨缺口或歧义日期', () => {
    const points = [point('2026-11-02T00:00:00+08:00'), point('2026-11-04T00:00:00+08:00')];
    const fills = [fill('2026-11-02T09:30:00+08:00'), fill('2026-11-03T09:30:00+08:00')];
    expect(projectBacktestTradeMarkers(fills, points, 'Asia/Hong_Kong', 'same-date')).toMatchObject({
      tradeMarkers: [{ time: points[0]!.time, fills: [{ occurredAt: fills[0]!.occurredAt, price: fills[0]!.price, quantity: fills[0]!.quantity }] }], unmappedFillCount: 1,
    });
    expect(projectBacktestTradeMarkers([fills[0]], [...points, point('2026-11-02T16:00:00+08:00')], 'Asia/Hong_Kong', 'same-date'))
      .toEqual({ tradeMarkers: [], unmappedFillCount: 1 });
  });
  it('精确匹配及盘中投影聚合同方向，保留买卖双方和原始成交精度', () => {
    const equity = [point('2026-11-02T21:00:00Z')];
    const fills = [fill('2026-11-02T21:00:00Z', 'sell'), fill('2026-11-02T15:00:00Z'), fill('2026-11-02T14:30:00Z')];
    const before = JSON.stringify({ equity, fills });
    const projected = projectBacktestTradeMarkers(fills, equity, 'America/New_York');
    expect(projected.unmappedFillCount).toBe(0);
    expect(projected.tradeMarkers.map(group => [group.side, group.time, group.fills.length])).toEqual([
      ['buy', equity[0]!.time, 2], ['sell', equity[0]!.time, 1],
    ]);
    expect(projected.tradeMarkers[0]!.fills.map(fill => fill.occurredAt)).toEqual(['2026-11-02T14:30:00Z', '2026-11-02T15:00:00Z']);
    expect(projected.tradeMarkers[0]!.fills[0]).toMatchObject({ quantity: fills[0]!.quantity, price: fills[0]!.price });
    expect(JSON.stringify({ equity, fills })).toBe(before);
  });

  it('分钟序列使用成交之后首个权益点，不回填前一个点', () => {
    const equity = [point('2026-11-02T14:30:00Z'), point('2026-11-02T14:31:00Z'), point('2026-11-02T14:32:00Z')];
    expect(projectBacktestTradeMarkers([fill('2026-11-02T14:30:30Z')], equity, 'UTC').tradeMarkers[0]?.time).toBe(equity[1]!.time);
  });

  it('日期比较跟随结果时区，不能用 UTC 日期截断跨午夜记录', () => {
    const equity = [point('2026-06-02T01:00:00Z')], fills = [fill('2026-06-01T23:00:00Z')];
    expect(projectBacktestTradeMarkers(fills, equity, 'America/New_York').tradeMarkers).toHaveLength(1);
    expect(projectBacktestTradeMarkers(fills, equity, 'UTC').unmappedFillCount).toBe(1);
  });

  it('夏令时前后使用各自真实时间戳，不硬编码开盘或收盘时间', () => {
    const equity = [point('2026-03-06T21:00:00Z'), point('2026-03-09T20:00:00Z')];
    const fills = [fill('2026-03-06T14:30:00Z'), fill('2026-03-09T13:30:00Z')];
    expect(projectBacktestTradeMarkers(fills, equity, 'America/New_York').tradeMarkers.map(group => group.time)).toEqual(equity.map(point => point.time));
  });

  it('不跨缺口或日期猜测点位，无效时间和方向只计入未映射数量', () => {
    const equity = [point('2026-11-03T21:00:00Z')];
    const fills = [null, fill('bad'), fill('2026-11-03T14:30:00Z', 'unknown'), fill('2026-11-02T14:30:00Z'), fill('2026-11-04T14:30:00Z'), fill('2026-11-03T22:00:00Z')];
    expect(projectBacktestTradeMarkers(fills, equity, 'America/New_York')).toEqual({ tradeMarkers: [], unmappedFillCount: fills.length });
  });

  it('空权益、空成交和缺失成交分别保留覆盖语义', () => {
    expect(projectBacktestTradeMarkers([fill('2026-11-02T14:30:00Z')], [], 'UTC')).toEqual({ tradeMarkers: [], unmappedFillCount: 1 });
    for (const fills of [undefined, [], {}]) expect(projectBacktestTradeMarkers(fills, [], 'UTC')).toEqual({ tradeMarkers: [], unmappedFillCount: 0 });
  });
});
