import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assessMarketRouteCompatibilityV3,
  marketRouteCompatibilityObservationV3Schema,
  marketRouteCompatibilityProofV3Schema,
  type MarketRouteCompatibilityObservationV3,
  type MarketRouteCompatibilityProofV3,
} from '../src/market-route-compatibility-v3.js';

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/market-route-compatibility-v3.synthetic.json', import.meta.url),
    'utf8',
  ),
) as {
  proof: MarketRouteCompatibilityProofV3;
  observation: MarketRouteCompatibilityObservationV3;
  now: string;
};

const copy = () => structuredClone(fixture);

const evaluate = (value: typeof fixture) => assessMarketRouteCompatibilityV3(value);

describe('market route compatibility proof V3', () => {
  it('accepts an explicitly evidenced equivalence for the exact source pair and complete window', () => {
    expect(marketRouteCompatibilityProofV3Schema.parse(fixture.proof)).toEqual(fixture.proof);
    expect(marketRouteCompatibilityObservationV3Schema.parse(fixture.observation)).toEqual(
      fixture.observation,
    );
    expect(evaluate(fixture)).toEqual({ eligible: true, reason: 'compatible' });
  });

  it('rejects a merely overlapping request window', () => {
    const input = copy();
    input.observation.window = { start: '2025-02-01', end: '2025-02-05' };
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'window_mismatch' });
  });

  it('rejects an expired proof', () => {
    const input = copy();
    input.now = '2027-01-01T00:00:00Z';
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'expired' });
  });

  it('binds the exact route key, ordered targets, and symbol', () => {
    const routeKeyMismatch = copy();
    routeKeyMismatch.observation.routeKey.adjustment = 'hfq';
    expect(evaluate(routeKeyMismatch).reason).toBe('identity_mismatch');

    const targetMismatch = copy();
    targetMismatch.observation.targets.backup.upstreamSource = 'synthetic-other-adapter';
    expect(evaluate(targetMismatch).reason).toBe('identity_mismatch');

    const symbolMismatch = copy();
    symbolMismatch.observation.symbol = 'OTHER.SYNTHETIC';
    expect(evaluate(symbolMismatch).reason).toBe('identity_mismatch');
  });

  it.each([
    [
      'unknown amount semantics',
      (facts: MarketRoutePriceFactsMutable) => {
        facts.amountSemantics = { status: 'unknown' };
      },
    ],
    [
      'provider-defined basis',
      (facts: MarketRoutePriceFactsMutable) => {
        facts.priceBasis.basisScope = 'provider-defined';
      },
    ],
    [
      'null anchor',
      (facts: MarketRoutePriceFactsMutable) => {
        facts.priceBasis.anchor = null;
      },
    ],
    [
      'unknown volume basis',
      (facts: MarketRoutePriceFactsMutable) => {
        facts.priceBasis.volumeBasis = 'unknown';
      },
    ],
    [
      'provider-defined dividend meaning',
      (facts: MarketRoutePriceFactsMutable) => {
        facts.priceBasis.dividendMeaning = 'provider-defined';
        facts.priceBasis.dividendEvidenceRef = null;
      },
    ],
  ])('fails closed for %s', (_name, mutateFacts) => {
    const input = copy();
    mutateFacts(input.proof.sourceFacts.primary as MarketRoutePriceFactsMutable);
    mutateFacts(input.observation.sourceFacts.primary as MarketRoutePriceFactsMutable);
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'basis_unverified' });
  });

  it('rejects semantic differences under an equivalence claim', () => {
    const input = copy();
    input.proof.sourceFacts.backup.amountSemantics = {
      status: 'verified',
      currency: 'CNY',
      unitMultiplier: 1_000,
      definition: 'reported-turnover',
      evidenceRef: 'synthetic://amount/source-b-thousand',
    };
    input.observation.sourceFacts.backup.amountSemantics = structuredClone(
      input.proof.sourceFacts.backup.amountSemantics,
    );
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'semantics_mismatch' });
  });

  it('requires conversion evidence for volume and dividend semantic conflicts', () => {
    const input = copy();
    input.proof.sourceFacts.backup.priceBasis.volumeBasis = 'original';
    input.proof.sourceFacts.backup.priceBasis.dividendMeaning = 'explicit-cash';
    input.proof.sourceFacts.backup.priceBasis.dividendEvidenceRef =
      'synthetic://cash-dividends/source-b';
    input.observation.sourceFacts.backup.priceBasis.volumeBasis = 'original';
    input.observation.sourceFacts.backup.priceBasis.dividendMeaning = 'explicit-cash';
    input.observation.sourceFacts.backup.priceBasis.dividendEvidenceRef =
      'synthetic://cash-dividends/source-b';
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'semantics_mismatch' });
  });

  it('requires explicit evidence to accept differing adjustment algorithm versions', () => {
    const input = copy();
    input.proof.sourceFacts.backup.priceBasis.methodVersion = 'synthetic-qfq-method-8';
    input.observation.sourceFacts.backup.priceBasis.methodVersion = 'synthetic-qfq-method-8';
    expect(evaluate(input)).toEqual({ eligible: true, reason: 'compatible' });
  });

  it('accepts a dimension-specific conversion tied to both series fingerprints', () => {
    const input = copy();
    input.proof.sourceFacts.backup.amountSemantics = {
      status: 'verified',
      currency: 'CNY',
      unitMultiplier: 1_000,
      definition: 'reported-turnover',
      evidenceRef: 'synthetic://amount/source-b-thousand',
    };
    input.observation.sourceFacts.backup.amountSemantics = structuredClone(
      input.proof.sourceFacts.backup.amountSemantics,
    );
    input.proof.verification = {
      kind: 'verified-conversion',
      algorithmId: 'synthetic-amount-scale-normalizer',
      algorithmVersion: '1.2.0',
      dimensions: ['amount'],
      inputFingerprint: input.proof.sourceFacts.backup.seriesFingerprint,
      outputFingerprint: input.proof.sourceFacts.primary.seriesFingerprint,
      evidence: [
        {
          reference: 'synthetic://conversion-run/01',
          revision: 'run-rev-1',
          fingerprint: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        },
      ],
    };
    expect(evaluate(input)).toEqual({ eligible: true, reason: 'compatible' });
  });

  it('rejects a conversion declaration that does not cover the changed dimension', () => {
    const input = copy();
    input.proof.sourceFacts.backup.amountSemantics = {
      status: 'verified',
      currency: 'CNY',
      unitMultiplier: 1_000,
      definition: 'reported-turnover',
      evidenceRef: 'synthetic://amount/source-b-thousand',
    };
    input.observation.sourceFacts.backup.amountSemantics = structuredClone(
      input.proof.sourceFacts.backup.amountSemantics,
    );
    input.proof.verification = {
      kind: 'verified-conversion',
      algorithmId: 'synthetic-amount-scale-normalizer',
      algorithmVersion: '1.2.0',
      dimensions: ['volume'],
      inputFingerprint: input.proof.sourceFacts.backup.seriesFingerprint,
      outputFingerprint: input.proof.sourceFacts.primary.seriesFingerprint,
      evidence: [
        {
          reference: 'synthetic://conversion-run/01',
          revision: 'run-rev-1',
          fingerprint: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        },
      ],
    };
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'conversion_mismatch' });
  });

  it('does not infer compatibility from matching labels or method versions without a proof', () => {
    const input = copy();
    Reflect.deleteProperty(input.proof, 'verification');
    expect(evaluate(input)).toEqual({ eligible: false, reason: 'invalid_proof' });
  });

  it('rejects changed price fact fingerprints and strict-schema extensions', () => {
    const changedFingerprint = copy();
    changedFingerprint.observation.sourceFacts.backup.seriesFingerprint =
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    expect(evaluate(changedFingerprint).reason).toBe('source_facts_mismatch');

    const extraField = { ...fixture.proof, unregisteredOverride: true };
    expect(marketRouteCompatibilityProofV3Schema.safeParse(extraField).success).toBe(false);
  });
});

type MarketRoutePriceFactsMutable = {
  priceBasis: {
    basisScope: 'global' | 'request-window' | 'provider-defined';
    anchor: string | null;
    volumeBasis: 'original' | 'split-adjusted' | 'unknown';
    dividendMeaning: 'explicit-cash' | 'embedded-verified' | 'provider-defined';
    dividendEvidenceRef: string | null;
  };
  amountSemantics:
    | { status: 'unknown' }
    | {
        status: 'verified';
        currency: string;
        unitMultiplier: number;
        definition: string;
        evidenceRef: string;
      };
};
