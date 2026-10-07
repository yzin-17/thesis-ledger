import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { marketDataBarSeriesResponseV3Schema } from '../src/market-data-wire-v3.js';
import { marketDataMultiWindowResponseV3Schema } from '../src/market-multi-window-v3.js';
import { canonicalMarketMultiWindowEncodingV3 } from '../src/market-multi-window-encoding-v3.js';

const fixture = () => {
  const base = marketDataBarSeriesResponseV3Schema.parse(JSON.parse(readFileSync(
    new URL('../fixtures/market-data-v3.response.etf-qfq.json', import.meta.url), 'utf8',
  )));
  const windowObservations = [0, 1].map((offset) => {
    const response = structuredClone(base);
    response.bars = response.bars.slice(offset, offset + 2);
    const dates = response.coverageProof.calendar.expectedSessionDates.slice(offset, offset + 2);
    response.coverageProof.calendar.expectedSessionDates = dates;
    response.coverageProof.window.requestedStart = dates[0]!;
    response.coverageProof.window.requestedEnd = dates[1]!;
    response.coverage.requestedStart = dates[0]!;
    response.coverage.requestedEnd = dates[1]!;
    response.coverage.actualStart = response.bars[0]!.timestamp;
    response.coverage.actualEnd = response.bars[1]!.timestamp;
    response.coverage.latestCompleteTradingDate = dates[1]!;
    return { startedAt: '2026-05-20T07:00:00Z', completedAt: '2026-05-20T07:02:00Z', response };
  });
  base.sourcePriceBasis.basisScope = 'request-window';
  base.sourcePriceBasis.observedAt = '2026-05-20T07:02:00Z';
  base.sourcePriceBasis.revision = { origin: 'local-observation', contentHash: 'a'.repeat(64) };
  return { ...base, windowObservations };
};

describe('多窗口响应合同', () => {
  it('接受 Python 组合器产物并独立验证其完整内容指纹', () => {
    const response = marketDataMultiWindowResponseV3Schema.parse(JSON.parse(readFileSync(
      new URL('../fixtures/market-data-v3.multi-window-produced.json', import.meta.url), 'utf8',
    )));
    const hash = createHash('sha256').update(canonicalMarketMultiWindowEncodingV3(response)).digest('hex');
    expect(response.inputFingerprint).toBe(hash);
    expect(response.sourcePriceBasis.revision).toEqual({ origin: 'local-observation', contentHash: hash });
    expect(response.bars[1]!.availableAt).toBe('2026-05-20T07:01:30Z');
  });
  it('重叠行情相同但可用时间不同，父窗口必须保留较晚的时间', () => {
    const value = fixture();
    const later = '2026-05-20T07:01:30Z';
    value.windowObservations[1]!.response.bars[0]!.availableAt = later;
    expect(marketDataMultiWindowResponseV3Schema.safeParse(value).success).toBe(false);
    value.bars[1]!.availableAt = later;
    expect(marketDataMultiWindowResponseV3Schema.safeParse(value).success).toBe(true);
    value.windowObservations.reverse();
    expect(marketDataMultiWindowResponseV3Schema.safeParse(value).success).toBe(false);
  });
  it('与 Python 生成的完整响应 golden 指纹一致', () => {
    const golden = JSON.parse(readFileSync(
      new URL('../fixtures/market-data-v3.multi-window-hash.json', import.meta.url), 'utf8',
    ));
    const encoded = canonicalMarketMultiWindowEncodingV3(golden.response);
    expect(createHash('sha256').update(encoded).digest('hex')).toBe(golden.expectedContentHash);
  });
  it('编码忽略传输关联及父哈希自身，保留子响应指纹和观测时间', () => {
    const value = fixture();
    const encoded = canonicalMarketMultiWindowEncodingV3(value);
    const transport = structuredClone(value);
    transport.requestId = 'new-parent';
    transport.inputFingerprint = 'new-parent-fingerprint';
    transport.sourcePriceBasis.revision = { origin: 'local-observation', contentHash: 'b'.repeat(64) };
    transport.windowObservations[0]!.response.requestId = 'new-child';
    expect(canonicalMarketMultiWindowEncodingV3(transport)).toBe(encoded);
    transport.windowObservations[0]!.response.inputFingerprint = 'changed-child';
    expect(canonicalMarketMultiWindowEncodingV3(transport)).not.toBe(encoded);
    const observation = structuredClone(value);
    observation.windowObservations[0]!.completedAt = '2026-05-20T07:03:00Z';
    observation.sourcePriceBasis.observedAt = '2026-05-20T07:03:00Z';
    expect(canonicalMarketMultiWindowEncodingV3(observation)).not.toBe(encoded);
    expect(canonicalMarketMultiWindowEncodingV3(Object.fromEntries(Object.entries(value).reverse())))
      .toBe(encoded);
    expect(value.requestId).not.toBe('multi-window-transport');
  });
  it('保留两次完整单窗响应及共同交易日，旧解析器不接受新字段', () => {
    const value = fixture();
    expect(marketDataMultiWindowResponseV3Schema.parse(value)).toEqual(value);
    expect(marketDataBarSeriesResponseV3Schema.safeParse(value).success).toBe(false);
  });

  it.each(['identity', 'conflict', 'parent', 'time', 'basis', 'nested', 'order', 'parent-time', 'child-time'])(
    '拒绝不满足父子观测约束的 %s', (kind) => {
      const value = fixture();
      const child = value.windowObservations[1]!;
      if (kind === 'identity') child.response.provenance.effectivePolicyRevision += 1;
      if (kind === 'conflict') child.response.bars[0]!.close += 0.001;
      if (kind === 'parent') value.bars[0]!.volume += 1;
      if (kind === 'time') child.startedAt = '2026-05-21T00:00:00Z';
      if (kind === 'child-time') child.response.sourcePriceBasis.observedAt = '2026-05-21T00:00:00Z';
      if (kind === 'parent-time') value.sourcePriceBasis.observedAt = '2026-05-20T07:01:00Z';
      if (kind === 'basis') value.sourcePriceBasis.basisScope = 'global';
      if (kind === 'nested') Object.assign(child.response, { windowObservations: [] });
      if (kind === 'order') value.windowObservations.reverse();
      expect(marketDataMultiWindowResponseV3Schema.safeParse(value).success).toBe(false);
    },
  );
});
