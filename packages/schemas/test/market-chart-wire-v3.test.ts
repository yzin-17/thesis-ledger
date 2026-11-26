import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketChartBarsRequestV3Schema,
  marketChartBarsResponseV3Schema,
  marketChartBarsRequestResponseV3Schema,
} from '../src/market-chart-wire-v3.js';
import { marketDataBarSeriesResponseV3Schema } from '../src/market-data-wire-v3.js';
import { marketDetailRequestSchema } from '../src/market.js';

const fixture = () => {
  const original = marketDataBarSeriesResponseV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/market-data-v3.response.etf-qfq.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const { coverageProof: _proof, ...base } = original;
  void _proof;
  const response = { ...base, purpose: 'interactive-chart' as const };
  const request = {
    contractVersion: 1 as const,
    purpose: 'interactive-chart' as const,
    requestId: response.requestId,
    symbol: response.symbol,
    routeKey: response.routeKey,
    start: response.coverage.requestedStart,
    end: response.coverage.requestedEnd,
    routeTarget: {
      providerId: response.provenance.providerId,
      upstreamSource: response.provenance.upstreamSource,
      routeIndex: 0,
    },
  };
  return { original, request, response };
};

describe('图表交互 V3 契约', () => {
  it('行情详情只接受现行合同，整窗和 NAV 分别校验上限', () => {
    expect(marketDetailRequestSchema.safeParse({ symbol: '159516.SZ', barsLimit: 180 }).success).toBe(true);
    expect(marketDetailRequestSchema.safeParse({ symbol: '159516.SZ', chartContractVersion: 3 }).success).toBe(false);
    expect(marketDetailRequestSchema.safeParse({ symbol: '159516.SZ', chartContractVersion: 1, barsLimit: 3000 }).success).toBe(true);
    expect(marketDetailRequestSchema.safeParse({ symbol: '159516.SZ', chartContractVersion: 1, barsLimit: 3001 }).success).toBe(false);
    expect(marketDetailRequestSchema.safeParse({ symbol: '000001.OF', chartContractVersion: 1, navLimit: 91 }).success).toBe(false);
  });
  it.each(['incomplete', 'unknown'] as const)('保留 %s 日线且不放松完整窗口', (status) => {
    const { request, response, original } = fixture();
    response.bars.at(-1)!.completionStatus = status;
    response.coverage.latestCompleteTradingDate = '2026-05-19';
    expect(marketChartBarsRequestResponseV3Schema.safeParse({ request, response }).success).toBe(
      true,
    );
    expect(
      marketDataBarSeriesResponseV3Schema.safeParse({ ...original, bars: response.bars }).success,
    ).toBe(false);
    expect(marketDataBarSeriesResponseV3Schema.safeParse(response).success).toBe(false);
  });

  it('必须有独立用途与固定目标，不能携带回测完整证明', () => {
    const { request, response, original } = fixture();
    expect(marketChartBarsRequestResponseV3Schema.safeParse({ request, response }).success).toBe(
      true,
    );
    expect(
      marketChartBarsRequestV3Schema.safeParse({ ...request, purpose: undefined }).success,
    ).toBe(false);
    expect(
      marketChartBarsRequestV3Schema.safeParse({ ...request, routeTarget: undefined }).success,
    ).toBe(false);
    expect(
      marketChartBarsResponseV3Schema.safeParse({
        ...response,
        coverageProof: original.coverageProof,
      }).success,
    ).toBe(false);
  });

  it('拒绝请求、证券、口径、目标或日期窗口串用', () => {
    const { request, response } = fixture();
    for (const changed of [
      { ...request, requestId: 'other' },
      { ...request, symbol: 'other' },
      { ...request, routeKey: { ...request.routeKey, adjustment: 'hfq' } },
      { ...request, start: '2026-05-17' },
      { ...request, end: '2026-05-21' },
      { ...request, routeTarget: { ...request.routeTarget, providerId: 'other' } },
      { ...request, routeTarget: { ...request.routeTarget, upstreamSource: 'other' } },
      { ...request, routeTarget: { ...request.routeTarget, routeIndex: 1 } },
    ])
      expect(
        marketChartBarsRequestResponseV3Schema.safeParse({ request: changed, response }).success,
      ).toBe(false);
  });

  it('拒绝非法价格、排序、同日重复和范围外数据', () => {
    const { response } = fixture();
    for (const bars of [
      [...response.bars].reverse(),
      response.bars.map((point, index) => (index === 0 ? { ...point, high: 0 } : point)),
      response.bars.map((point, index) =>
        index === 0 ? { ...point, timestamp: '2026-05-17T07:00:00Z' } : point,
      ),
      response.bars.map((point, index) =>
        index === 1 ? { ...point, timestamp: '2026-05-18T08:00:00Z' } : point,
      ),
    ])
      expect(marketChartBarsResponseV3Schema.safeParse({ ...response, bars }).success).toBe(false);
  });

  it('实际边界和完整交易日必须来自返回日线，不能伪造观测时点', () => {
    const { response } = fixture();
    for (const coverage of [
      { ...response.coverage, actualStart: null },
      { ...response.coverage, actualEnd: null },
      { ...response.coverage, latestCompleteTradingDate: '2026-05-21' },
    ])
      expect(marketChartBarsResponseV3Schema.safeParse({ ...response, coverage }).success).toBe(
        false,
      );
    expect(
      marketChartBarsResponseV3Schema.safeParse({
        ...response,
        sourcePriceBasis: { ...response.sourcePriceBasis, observedAt: '2020-01-01T00:00:00Z' },
      }).success,
    ).toBe(false);
  });

  it('允许真实空窗口但不虚构实际覆盖', () => {
    const { response } = fixture();
    const empty = {
      ...response,
      bars: [],
      coverage: {
        ...response.coverage,
        actualStart: null,
        actualEnd: null,
        latestCompleteTradingDate: null,
      },
    };
    expect(marketChartBarsResponseV3Schema.safeParse(empty).success).toBe(true);
    expect(
      marketChartBarsResponseV3Schema.safeParse({ ...empty, coverage: response.coverage }).success,
    ).toBe(false);
  });
});


describe('原生小时来源语义', () => {
  it('保留中国 ETF 小时和未知完成状态，拒绝未来时间', () => {
    const { response } = fixture();
    const timestamp = '2026-05-18T10:30:00+08:00';
    const native = { ...response, symbol: '510300.SH', session: 'regular', timestampConvention: 'source-native',
      routeKey: { ...response.routeKey, timeframe: '60m', capability: 'MINUTE_BAR', adjustment: 'none' },
      sourcePriceBasis: { ...response.sourcePriceBasis, adjustment: 'none' },
      bars: [{ ...response.bars[0]!, timestamp, completionStatus: 'unknown', volume: 0, amount: null }],
      coverage: { ...response.coverage, actualStart: timestamp, actualEnd: timestamp, latestCompleteTradingDate: null } };
    expect(marketChartBarsResponseV3Schema.safeParse(native).success).toBe(true);
    expect(marketChartBarsResponseV3Schema.safeParse({ ...native,
      bars: native.bars.map((bar) => ({ ...bar, completionStatus: 'complete' })) }).success).toBe(false);
    expect(marketChartBarsResponseV3Schema.safeParse({ ...native, sourcePriceBasis: {
      ...native.sourcePriceBasis, observedAt: '2026-05-18T02:29:00Z' } }).success).toBe(false);
  });
});
