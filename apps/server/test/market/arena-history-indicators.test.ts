import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  indicatorCalculateRequestSchema,
  type IndicatorCalculateResponse,
} from '@thesis-ledger/schemas';
import { MarketArenaHistorySource } from '../../src/market/market-arena-history-source.js';
import { barSeriesInputFingerprint } from '../../src/market/market-bar-window.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const stamp = '2026-11-10T01:30:00.000Z';
const protocol = liveProtocolFixture({
  market: 'CN',
  currency: 'CNY',
  timeZone: 'Asia/Shanghai',
  universe: 'fixed',
  instruments: [
    { instrumentId: '11111111-1111-4111-8111-111111111111', symbol: '588000.SH', assetType: 'ETF' },
  ],
});
const minutes = (timeframe: '1m' | '5m' | '15m' | '30m' | '60m') => ({
  contractVersion: 1 as const,
  consumer: 'thesis-ledger' as const,
  requestId: 'controlled',
  kind: 'reconstructed-minutes' as const,
  date: '2026-11-10',
  providerId: 'futu',
  policyRevision: 200,
  archiveRef: `arena-history/${'a'.repeat(64)}.json`,
  value: {
    symbol: '588000.SH',
    assetType: 'ETF' as const,
    market: 'CN' as const,
    source: 'futu',
    timezone: 'Asia/Shanghai' as const,
    timeframe,
    session: 'regular' as const,
    timestampConvention: 'interval-start' as const,
    observedAt: '2026-11-16T00:00:00.000Z',
    responseSha256: 'a'.repeat(64),
    fieldUnits: { volume: 'share' as const, amount: 'CNY' as const },
    rows: [0, 1, 2].map((i) => ({
      timestamp: new Date(Date.parse(stamp) + i * parseInt(timeframe) * 60000).toISOString(),
      open: 1.343,
      high: 1.345,
      low: 1.34,
      close: 1.343,
      volume: 1e20,
      amount: 1e-7,
      complete: true,
    })),
  },
});
type Calculation = Parameters<
  NonNullable<ConstructorParameters<typeof MarketArenaHistorySource>[0]['calculateIndicators']>
>[0];
const response = (input: Calculation): IndicatorCalculateResponse => ({
  contractVersion: 1,
  engineVersion: 'dsa-indicator-v3',
  inputFingerprint: input.inputFingerprint,
  results: input.requests.map((r) => ({
    ...r,
    inputFingerprint: input.inputFingerprint,
    points: [],
  })),
});

describe('历史研究指标输入绑定', () => {
  it.each(['1m', '5m', '15m', '30m', '60m'] as const)(
    '%s 的 K 线与指标共用裁剪后的规范化指纹',
    async (timeframe) => {
      const calculateIndicators = vi.fn(async (input: Calculation) => {
        indicatorCalculateRequestSchema.parse({ contractVersion: 1, ...input });
        return response(input);
      });
      const source = new MarketArenaHistorySource({
        arenaHistoryMinutes: vi.fn(async () => minutes(timeframe)),
        calculateIndicators,
      });
      const at = new Date(Date.parse(stamp) + 2 * parseInt(timeframe) * 60000).toISOString();
      const request = { symbol: '588000.SH', timeframe, limit: 1 };
      const bars = await source.research(protocol, at, request);
      if (!('points' in bars) || !bars.identity) throw Error('应返回研究 K 线');
      expect(bars.points).toHaveLength(1);
      expect(bars.points[0]).toMatchObject({ timestamp: at, availableAt: at, close: 1.343 });
      expect(bars.inputFingerprint).toBe(barSeriesInputFingerprint(bars.identity, bars.points));
      expect(bars.inputFingerprint).not.toBe(
        createHash('sha256')
          .update(JSON.stringify({ identity: bars.identity, points: bars.points }))
          .digest('hex'),
      );
      for (const indicator of ['MA', 'MACD'] as const) {
        const calculated = await source.research(protocol, at, { ...request, indicator });
        expect(calculated).toMatchObject({
          inputFingerprint: bars.inputFingerprint,
          results: [{ name: indicator, inputFingerprint: bars.inputFingerprint }],
        });
      }
      expect(calculateIndicators).toHaveBeenCalledTimes(2);
      expect(
        calculateIndicators.mock.calls.every(
          ([input]) => JSON.stringify(input.points) === JSON.stringify(bars.points),
        ),
      ).toBe(true);
    },
  );

  it.each(['top', 'result', 'engine', 'name', 'count'])(
    '继续拒绝 %s 不匹配的计算响应',
    async (kind) => {
      const source = new MarketArenaHistorySource({
        arenaHistoryMinutes: vi.fn(async () => minutes('5m')),
        calculateIndicators: vi.fn(async (input: Calculation) => {
          const result = response(input);
          if (kind === 'top') result.inputFingerprint = 'f'.repeat(64);
          if (kind === 'result') result.results[0]!.inputFingerprint = 'f'.repeat(64);
          if (kind === 'engine') result.engineVersion = 'wrong';
          if (kind === 'name') result.results[0]!.name = 'RSI';
          if (kind === 'count') result.results = [];
          return result;
        }),
      });
      await expect(
        source.research(protocol, '2026-11-10T01:40:00.000Z', {
          symbol: '588000.SH',
          timeframe: '5m',
          limit: 10,
          indicator: 'MA',
        }),
      ).rejects.toThrow('replay_tools_unavailable');
    },
  );
});
