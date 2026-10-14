import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DSA_MARKET_INDICATOR_ENGINE_VERSION } from '../../src/integration/dsa/dsa.client.js';
import { MarketPeriodIndicatorReader } from '../../src/market/market-period-indicator-reader.js';
import { buildMarketPeriodView } from '../../src/market/market-period-view.js';
import { periodViewFixture, refreshSourceFingerprint } from './market-period-view.fixture.js';

function fixture(warmup = true) {
  const { source, window } = periodViewFixture('1mo', warmup);
  const view = buildMarketPeriodView(source, window);
  const requests = [{ name: 'MA' as const, parameters: { period: 5 } }];
  const response = {
    contractVersion: 3,
    engineVersion: DSA_MARKET_INDICATOR_ENGINE_VERSION,
    inputFingerprint: view.calculation.series.inputFingerprint,
    results: [
      {
        name: 'MA',
        parameters: { period: 5 },
        inputFingerprint: view.calculation.series.inputFingerprint,
        points: view.calculation.series.points.map((point, index) => ({
          timestamp: point.timestamp.replace('Z', '+00:00'),
          values: { ma5: index < 4 ? null : 100 + index },
        })),
      },
    ],
  };
  const calculate = vi.fn().mockResolvedValue(response);
  const reader = new MarketPeriodIndicatorReader({
    calculatePeriodIndicators: calculate,
  } as unknown as DsaClient);
  return { source, window, view, requests, response, calculate, reader };
}

describe('派生指标输入与显示投影', () => {
  it('只将派生预热点交给 DSA，显示投影保留完整计算证据', async () => {
    const f = fixture();
    const result = await f.reader.read(f.view, f.requests);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(result.reason);
    const submitted = f.calculate.mock.calls[0]![0];
    expect(submitted.identity.timeframe).toBe('1mo');
    expect(submitted.points).toHaveLength(61);
    expect(submitted.periodContext).toEqual(f.view.calculation.periodContext);
    expect(result.response.inputFingerprint).toBe(f.view.visible.series.inputFingerprint);
    expect(result.response.results[0]!.calculationInput).toMatchObject({
      inputFingerprint: f.view.calculation.series.inputFingerprint,
      pointCount: 61,
    });
    expect(result.response.results[0]!.points).toEqual(
      f.view.visible.series.points.map((point, index) => ({
        timestamp: point.timestamp,
        values: { ma5: 159 + index },
      })),
    );
    expect(f.response.inputFingerprint).toBe(f.view.calculation.series.inputFingerprint);
  });
  it('已验证计算命中缓存，refresh 再计算', async () => {
    const f = fixture();
    const first = await f.reader.read(f.view, f.requests);
    expect(await f.reader.read(f.view, f.requests)).toEqual(first);
    expect(f.calculate).toHaveBeenCalledTimes(1);
    await f.reader.read(f.view, f.requests, true);
    expect(f.calculate).toHaveBeenCalledTimes(2);
  });
  it('真实输入变化不复用旧指标，预热不足的 null 保留', async () => {
    const f = fixture(false);
    const result = await f.reader.read(f.view, f.requests);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(result.reason);
    expect(result.response.results[0]!.points.every((point) => point.values.ma5 === null)).toBe(
      true,
    );
    f.source.points[0]!.volume = f.source.points[0]!.volume! + 1;
    refreshSourceFingerprint(f.source);
    const nextView = buildMarketPeriodView(f.source, f.window);
    f.calculate.mockResolvedValue({
      ...f.response,
      inputFingerprint: nextView.calculation.series.inputFingerprint,
      results: f.response.results.map((result) => ({
        ...result,
        inputFingerprint: nextView.calculation.series.inputFingerprint,
      })),
    });
    expect((await f.reader.read(nextView, f.requests)).status).toBe('ready');
    expect(f.calculate).toHaveBeenCalledTimes(2);
  });
  it.each(['engine', 'fingerprint', 'requests', 'points', 'instant', 'extra'] as const)(
    '拒绝 DSA %s 错配',
    async (kind) => {
      const f = fixture(false);
      if (kind === 'engine') f.response.engineVersion = 'unknown-engine';
      if (kind === 'fingerprint') f.response.inputFingerprint = 'wrong';
      if (kind === 'requests') f.response.results[0]!.parameters.period = 10;
      if (kind === 'points') f.response.results[0]!.points.pop();
      if (kind === 'instant')
        f.response.results[0]!.points[0]!.timestamp =
          f.response.results[0]!.points[0]!.timestamp.replace('.000+00:00', '.000001+00:00');
      if (kind === 'extra')
        f.response.results.push({ ...f.response.results[0]!, parameters: { period: 20 } });
      expect(await f.reader.read(f.view, f.requests)).toEqual({
        status: 'unavailable',
        reason: 'indicator_invalid',
      });
    },
  );
  it('传输故障和 SDK 协议错误分别降级，不自动重试', async () => {
    const f = fixture(false);
    f.calculate.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new ZodError([]));
    expect(await f.reader.read(f.view, f.requests)).toEqual({
      status: 'unavailable',
      reason: 'indicator_unavailable',
    });
    expect(await f.reader.read(f.view, f.requests)).toEqual({
      status: 'unavailable',
      reason: 'indicator_invalid',
    });
    expect(f.calculate).toHaveBeenCalledTimes(2);
  });
  it('空输入或被篡改的计算点不触发 DSA', async () => {
    const f = fixture(false);
    f.view.calculation.series.points[0]!.volume = f.view.calculation.series.points[0]!.volume! + 1;
    await expect(f.reader.read(f.view, f.requests)).rejects.toThrow();
    expect(f.calculate).not.toHaveBeenCalled();
    f.source.points = [];
    refreshSourceFingerprint(f.source);
    expect(await f.reader.read(buildMarketPeriodView(f.source, f.window), f.requests)).toEqual({
      status: 'unavailable',
      reason: 'indicator_input_empty',
    });
  });
});
