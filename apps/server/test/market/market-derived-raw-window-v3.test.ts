import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marketDataBarSeriesResponseV3Schema } from '@thesis-ledger/schemas';
import { freezeDerivedRawWindowV3 } from '../../src/market/market-derived-raw-window-v3.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import type { FrozenMarketWindowV3 } from '../../src/market/market-frozen-window-view-v3.js';

function fixture() {
  const response = marketDataBarSeriesResponseV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  response.routeKey.adjustment = 'none';
  response.sourcePriceBasis.adjustment = 'none';
  response.sourcePriceBasis.volumeBasis = 'original';
  const hash = marketFrozenWindowHashV3(response);
  const reference = {
    version: 'market-frozen-window-v1' as const,
    identityFingerprint: 'a'.repeat(64),
    responseHash: hash,
  };
  const frozen = {
    request: {
      contractVersion: 3,
      requestId: response.requestId,
      symbol: response.symbol,
      routeKey: response.routeKey,
      start: response.coverage.requestedStart,
      end: response.coverage.requestedEnd,
    },
    response,
    completeResponseHash: hash,
    evidence: {
      identityFingerprint: reference.identityFingerprint,
      fetchedAt: new Date('2026-06-01T00:00:00Z'),
    },
  } as FrozenMarketWindowV3;
  const conversion = {
    kind: 'multiplicative-price-factor' as const,
    adjustment: 'qfq' as const,
    evidenceRef: 'factor-proof',
    sourceRevision: 'v1',
    basisRef: 'fixed',
    anchorFactor: 1,
    anchorAvailableAt: '2026-06-01T00:00:00Z',
    volumeSemantics: 'unadjusted' as const,
    amountSemantics: 'unadjusted' as const,
    rawResponseHash: hash,
    factors: response.bars.map((bar) => ({
      timestamp: bar.timestamp,
      value: 1,
      availableAt: '2026-06-01T00:00:00Z',
    })),
  };
  return { frozen, reference, conversion };
}

describe('冻结 raw 响应派生接缝', () => {
  it('从冻结响应固定标的和 Bar，绑定完整响应引用', () => {
    const f = fixture();
    const result = freezeDerivedRawWindowV3(
      f.frozen,
      f.reference,
      f.conversion,
      '2026-09-27T00:00:00Z',
    );
    expect(result.input.identity.symbol).toBe(f.frozen.response.symbol);
    expect(result.input.rawEvidenceRef).toContain(f.reference.responseHash);
    expect(result.input.bars).toHaveLength(f.frozen.response.bars.length);
  });
  it.each(['binding', 'content', 'adjusted', 'request', 'late'] as const)(
    '拒绝 %s 不匹配',
    (kind) => {
      const f = fixture();
      if (kind === 'binding') f.conversion.rawResponseHash = 'b'.repeat(64);
      else if (kind === 'content') f.frozen.response.bars[0]!.amount += 1;
      else if (kind === 'adjusted') f.frozen.response.routeKey.adjustment = 'qfq';
      else if (kind === 'request') f.frozen.request.symbol = '510300.SH';
      else f.frozen.response.sourcePriceBasis.observedAt = '2099-01-01T00:00:00Z';
      if (kind === 'adjusted' || kind === 'late') {
        f.frozen.response.sourcePriceBasis.adjustment = f.frozen.response.routeKey.adjustment;
        const hash = marketFrozenWindowHashV3(f.frozen.response);
        f.reference.responseHash = hash;
        f.frozen.completeResponseHash = hash;
        f.conversion.rawResponseHash = hash;
        f.frozen.request.routeKey = { ...f.frozen.response.routeKey };
      }
      expect(() =>
        freezeDerivedRawWindowV3(f.frozen, f.reference, f.conversion, '2026-09-27T00:00:00Z'),
      ).toThrow();
    },
  );
  it('拒绝晚于截点一微秒的来源观察', () => {
    const f = fixture();
    f.frozen.response.sourcePriceBasis.observedAt = '2026-09-27T00:00:00.123456Z';
    const hash = marketFrozenWindowHashV3(f.frozen.response);
    f.reference.responseHash = hash;
    f.frozen.completeResponseHash = hash;
    f.conversion.rawResponseHash = hash;
    expect(() =>
      freezeDerivedRawWindowV3(f.frozen, f.reference, f.conversion, '2026-09-27T00:00:00.123455Z'),
    ).toThrow('冻结 raw 来源观测晚于派生截点');
  });
  it('raw 来源观察的微秒精度进入派生 Bar', () => {
    const f = fixture();
    f.frozen.response.sourcePriceBasis.observedAt = '2026-09-27T00:00:00.123456Z';
    const hash = marketFrozenWindowHashV3(f.frozen.response);
    f.reference.responseHash = hash;
    f.frozen.completeResponseHash = hash;
    f.conversion.rawResponseHash = hash;
    const snapshot = freezeDerivedRawWindowV3(
      f.frozen,
      f.reference,
      f.conversion,
      '2026-09-27T00:00:00.123457Z',
    );
    expect(snapshot.input.bars[0]!.availableAt).toBe('2026-09-27T00:00:00.123456Z');
  });
});
