import { describe, expect, it } from 'vitest';
import { buildChartPoints, indicatorValue } from './market-chart-model.js';
import { normalizeMacdParams } from './market-chart-preferences.js';
import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';

const bar = (timestamp: string, inputFingerprint: string): MarketChartBar => ({
  symbol: '600519.SH',
  timeframe: '1d' as const,
  timestamp,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1000,
  amount: 100000,
  provider: 'efinance',
  fetchedAt: timestamp,
  freshness: 'live' as const,
  servedFromCache: false,
  completionStatus: 'complete',
  availableAt: timestamp,
  inputFingerprint,
});

const indicator = (inputFingerprint: string): MarketChartIndicator => ({
  symbol: '600519.SH',
  name: 'MACD' as const,
  parameters: { fast: 12, slow: 26, signal: 9 },
  timeframe: '1d' as const,
  marketTime: '2026-01-03T00:00:00.000Z',
  calculatedAt: '2026-01-03T00:00:00.000Z',
  values: { dif: 1, dea: 0.5, histogram: 0.5 },
  provider: 'efinance',
  engineVersion: 'dsa-v1',
  points: [
    {
      timestamp: '2026-01-01T00:00:00.000Z',
      values: { dif: null, dea: null, histogram: null },
      inputFingerprint,
    },
    {
      timestamp: '2026-01-03T00:00:00.000Z',
      values: { dif: 1, dea: 0.5, histogram: 0.5 },
      inputFingerprint,
    },
  ],
  inputProvenance: {
    timeframe: '1d',
    provider: 'efinance',
    upstreamSource: 'efinance',
    providerRevision: 'fixture',
    adjustment: 'qfq',
    inputDateRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-03T00:00:00.000Z' },
    inputFingerprint,
  },
  calculationAnchor: { timestamp: '2026-01-01T00:00:00.000Z', inputFingerprint },
  coverage: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-03T00:00:00.000Z', complete: true, hasMoreBefore: false },
  servedFromCache: false,
});

describe('market chart model', () => {
  it('keeps date gaps and null indicator warmup values as whitespace', () => {
    const points = buildChartPoints(
      [bar('2026-01-01T00:00:00.000Z', 'a'), bar('2026-01-03T00:00:00.000Z', 'b')],
      [indicator('a')],
    );
    expect(points.map((point) => point.date)).toEqual(['2026-01-01', '2026-01-03']);
    expect(indicatorValue(points[0]?.indicators.MACD, ['histogram'])).toBeNull();
    expect(indicatorValue(points[1]?.indicators.MACD, ['histogram'])).toBe(0.5);
  });

  it('marks a common date with mismatched input fingerprint as incomparable', () => {
    const [point] = buildChartPoints(
      [bar('2026-01-01T00:00:00.000Z', 'bar-input')],
      [indicator('indicator-input')],
    );
    expect(point?.comparable).toBe(false);
  });

  it('fails closed when a bar or point is missing its input fingerprint', () => {
    const source = indicator('same-input');
    const withoutPointFingerprint = {
      ...source,
      inputProvenance: {
        timeframe: '1d' as const,
        provider: 'efinance',
        inputDateRange: {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-01-03T00:00:00.000Z',
        },
        inputFingerprint: 'full-input',
      },
      calculationAnchor: {
        timestamp: '2026-01-01T00:00:00.000Z',
        inputFingerprint: 'anchor',
      },
      points: source.points?.map((point) => ({ ...point, inputFingerprint: undefined })),
    };
    const [missingBarFingerprint] = buildChartPoints(
      [{ ...bar('2026-01-03T00:00:00.000Z', 'same-input'), inputFingerprint: undefined }],
      [source],
    );
    const [missingPointFingerprint] = buildChartPoints(
      [bar('2026-01-03T00:00:00.000Z', 'same-input')],
      [withoutPointFingerprint],
    );
    expect(missingBarFingerprint?.comparableIndicators.MACD).toBe(false);
    expect(missingPointFingerprint?.comparableIndicators.MACD).toBe(false);
  });

  it('allows separate indicators to use different warmup anchors', () => {
    const source = indicator('same-input');
    const evidence = {
      inputProvenance: {
        timeframe: '1d' as const,
        provider: 'efinance',
        inputDateRange: {
          start: '2025-12-01T00:00:00.000Z',
          end: '2026-01-03T00:00:00.000Z',
        },
        inputFingerprint: 'full-input',
      },
    };
    const [point] = buildChartPoints(
      [bar('2026-01-03T00:00:00.000Z', 'same-input')],
      [
        {
          ...source,
          ...evidence,
          calculationAnchor: {
            timestamp: '2025-12-01T00:00:00.000Z',
            inputFingerprint: 'anchor-a',
          },
        },
        {
          ...source,
          name: 'RSI',
          ...evidence,
          calculationAnchor: {
            timestamp: '2025-12-02T00:00:00.000Z',
            inputFingerprint: 'anchor-b',
          },
        },
      ],
    );
    expect(point?.comparableIndicators.MACD).toBe(true);
    expect(point?.comparableIndicators.RSI).toBe(true);
    expect(point?.comparable).toBe(true);
  });

  it('rejects invalid persisted MACD preferences instead of sending them upstream', () => {
    expect(normalizeMacdParams({ fast: 26, slow: 12, signal: 9 })).toEqual({
      fast: 12,
      slow: 26,
      signal: 9,
    });
    expect(normalizeMacdParams({ fast: 1, slow: 26, signal: 9 })).toEqual({
      fast: 12,
      slow: 26,
      signal: 9,
    });
  });

  it('按各历史页自身证据选择同名指标，不丢弃不同 anchor 的更早点', () => {
    const older = {
      ...indicator('older-input'),
      inputProvenance: {
        timeframe: '1d' as const,
        provider: 'efinance',
        inputDateRange: { start: '2025-12-01', end: '2026-01-01' },
        inputFingerprint: 'older-window',
      },
      calculationAnchor: { timestamp: '2025-12-01', inputFingerprint: 'older-anchor' },
      points: [
        { timestamp: '2026-01-01', values: { histogram: 0.2 }, inputFingerprint: 'older-input' },
      ],
    };
    const newer = {
      ...indicator('newer-input'),
      inputProvenance: {
        timeframe: '1d' as const,
        provider: 'efinance',
        inputDateRange: { start: '2026-01-02', end: '2026-01-03' },
        inputFingerprint: 'newer-window',
      },
      calculationAnchor: { timestamp: '2026-01-02', inputFingerprint: 'newer-anchor' },
      points: [
        { timestamp: '2026-01-03', values: { histogram: 0.5 }, inputFingerprint: 'newer-input' },
      ],
    };
    const points = buildChartPoints(
      [
        bar('2026-01-01T00:00:00.000Z', 'older-input'),
        bar('2026-01-03T00:00:00.000Z', 'newer-input'),
      ],
      [older, newer],
    );
    expect(points.map((point) => point.date)).toEqual(['2026-01-01', '2026-01-03']);
    expect(points.every((point) => point.comparableIndicators.MACD)).toBe(true);
  });

  it('单页指纹不匹配只使该页日期不可比', () => {
    const older = {
      ...indicator('wrong-input'),
      inputProvenance: {
        timeframe: '1d' as const,
        provider: 'efinance',
        inputDateRange: { start: '2025-12-01', end: '2026-01-01' },
        inputFingerprint: 'older-window',
      },
      calculationAnchor: { timestamp: '2025-12-01', inputFingerprint: 'older-anchor' },
      points: [
        { timestamp: '2026-01-01', values: { histogram: 0.2 }, inputFingerprint: 'wrong-input' },
      ],
    };
    const newer = {
      ...indicator('newer-input'),
      inputProvenance: {
        timeframe: '1d' as const,
        provider: 'efinance',
        inputDateRange: { start: '2026-01-02', end: '2026-01-03' },
        inputFingerprint: 'newer-window',
      },
      calculationAnchor: { timestamp: '2026-01-02', inputFingerprint: 'newer-anchor' },
      points: [
        { timestamp: '2026-01-03', values: { histogram: 0.5 }, inputFingerprint: 'newer-input' },
      ],
    };
    const points = buildChartPoints(
      [
        bar('2026-01-01T00:00:00.000Z', 'actual-input'),
        bar('2026-01-03T00:00:00.000Z', 'newer-input'),
      ],
      [older, newer],
    );
    expect(points[0]?.comparableIndicators.MACD).toBe(false);
    expect(points[1]?.comparableIndicators.MACD).toBe(true);
  });
});
