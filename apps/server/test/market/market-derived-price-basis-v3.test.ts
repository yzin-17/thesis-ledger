import { describe, expect, it } from 'vitest';
import { freezeMarketDerivedSeriesV3 } from '../../src/market/market-derived-series-snapshot-v3.js';
import { resolveDerivedPriceBasisV3 } from '../../src/market/market-derived-price-basis-v3.js';

function fixture(factor = 2, close = 2) {
  const timestamp = '2025-06-01T07:00:00Z';
  const availableAt = '2026-09-27T00:00:00Z';
  return freezeMarketDerivedSeriesV3({
    identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'none' },
    rawEvidenceRef: 'raw-fixture',
    dataAsOf: availableAt,
    bars: [
      {
        timestamp,
        open: close,
        high: close,
        low: close,
        close,
        volume: 100,
        amount: 200,
        completionStatus: 'complete',
        availableAt,
      },
    ],
    conversion: {
      kind: 'multiplicative-price-factor',
      adjustment: 'qfq',
      evidenceRef: 'factor-proof',
      sourceRevision: 'v1',
      basisRef: 'fixed-anchor',
      anchorFactor: 2,
      anchorAvailableAt: availableAt,
      volumeSemantics: 'unadjusted',
      amountSemantics: 'unadjusted',
      factors: [{ timestamp, value: factor, availableAt }],
    },
  });
}
const semantics = {
  basisScope: 'request-window' as const,
  dividendMeaning: 'provider-defined' as const,
  dividendEvidenceRef: null,
};

describe('派生价格基准合同', () => {
  it('显式区分本地观测版本、算法、因子指纹及分红语义', () => {
    const frozen = fixture();
    const result = resolveDerivedPriceBasisV3(frozen, frozen.inputFingerprint, semantics);
    expect(result).toMatchObject({
      method: 'local-derived',
      basisScope: 'request-window',
      dividendMeaning: 'provider-defined',
      volumeBasis: 'original',
      revision: { origin: 'local-observation', contentHash: frozen.inputFingerprint },
      conversionEvidenceRef: 'factor-proof',
      observedAt: '2026-09-27T00:00:00Z',
    });
    expect(result.derivation?.factorOrEventFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('原始价格变化不改变独立因子指纹，因子修订则改变', () => {
    const basis = (factor: number, close: number) => {
      const frozen = fixture(factor, close);
      return resolveDerivedPriceBasisV3(frozen, frozen.inputFingerprint, semantics);
    };
    const first = basis(2, 2);
    expect(basis(2, 3).derivation?.factorOrEventFingerprint).toBe(
      first.derivation?.factorOrEventFingerprint,
    );
    expect(basis(2, 3).derivation?.inputFingerprint).not.toBe(first.derivation?.inputFingerprint);
    expect(basis(3, 2).derivation?.factorOrEventFingerprint).not.toBe(
      first.derivation?.factorOrEventFingerprint,
    );
  });
  it('价格基准保留派生 Bar 的微秒观察时刻', () => {
    const frozen = fixture();
    frozen.input.dataAsOf = '2026-09-27T00:00:00.123456Z';
    frozen.input.bars[0]!.availableAt = '2026-09-27T00:00:00.123455Z';
    frozen.input.conversion.factors[0]!.availableAt = '2026-09-27T00:00:00.123456Z';
    const refrozen = freezeMarketDerivedSeriesV3(frozen.input);
    expect(
      resolveDerivedPriceBasisV3(refrozen, refrozen.inputFingerprint, semantics).observedAt,
    ).toBe('2026-09-27T00:00:00.123456Z');
  });
  it('已核实分红语义必须提供独立证据', () => {
    const frozen = fixture();
    expect(() =>
      resolveDerivedPriceBasisV3(frozen, frozen.inputFingerprint, {
        ...semantics,
        dividendMeaning: 'embedded-verified',
      }),
    ).toThrow();
  });
});
