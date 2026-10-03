import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestSnapshotActualSourceV3Schema,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  type MarketDataBarSeriesResponseV3,
} from '@thesis-ledger/schemas';
import {
  BacktestSnapshotV3SourceError,
  createBacktestSnapshotV3Source,
  type BacktestSnapshotV3SourcePlan,
} from '../../src/backtest/backtest-snapshot-v3-source.js';
import { canonicalizeManifest } from '../../src/backtest/backtest-snapshot.js';
import type { MarketBarWindowReadResultV3 } from '../../src/market/market-bar-reader-v3.js';
import type {
  PinnedMarketWindowRequestV3,
  StoredMarketWindowEvidenceV3,
} from '../../src/market/market-window-evidence-v3.repository.js';

const readFixture = <T>(path: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${path}`, import.meta.url), 'utf8'),
  ) as T;

const requestTemplate = readFixture<unknown>('market-data-v3.request.etf-qfq-target-pinned.json');
const responseTemplate = readFixture<unknown>('market-data-v3.response.etf-qfq.json');

const makeReadResult = (): MarketBarWindowReadResultV3 => {
  const request = marketDataBarSeriesRequestV3Schema.parse(requestTemplate);
  if (!request.routeTarget) throw new Error('test fixture must include routeTarget');
  const pinnedRequest = request as PinnedMarketWindowRequestV3;
  const response = marketDataBarSeriesResponseV3Schema.parse(
    responseTemplate,
  ) as MarketDataBarSeriesResponseV3;
  const desiredRevision = 7;
  const effectivePolicyRevision = response.provenance.effectivePolicyRevision;
  const catalogRevision = 12;
  const seriesVersion = 'series-version-v3-etf-qfq';
  const evidence: StoredMarketWindowEvidenceV3 = {
    identityFingerprint: 'a'.repeat(64),
    routeKey: response.routeKey,
    target: pinnedRequest.routeTarget,
    symbol: response.symbol,
    window: { start: pinnedRequest.start, end: pinnedRequest.end },
    seriesVersion,
    inputFingerprint: response.inputFingerprint,
    desiredRevision,
    effectivePolicyRevision,
    catalogRevision,
    sourcePriceBasis: response.sourcePriceBasis,
    coverageProof: response.coverageProof,
    fetchedAt: new Date('2026-05-20T07:02:00.000Z'),
  };
  return {
    status: 'selected',
    request: pinnedRequest,
    seriesVersion,
    evidence,
    selection: {
      status: 'selected',
      source: 'primary',
      response,
      target: {
        providerId: pinnedRequest.routeTarget.providerId,
        upstreamSource: pinnedRequest.routeTarget.upstreamSource,
      },
      routeIndex: pinnedRequest.routeTarget.routeIndex,
      desiredRevision,
      effectivePolicyRevision,
      catalogRevision,
    },
  };
};

const planFor = (
  readResult = makeReadResult(),
  overrides: Partial<BacktestSnapshotV3SourcePlan> = {},
): BacktestSnapshotV3SourcePlan => {
  if (readResult.status !== 'selected') throw new Error('test reader result must be selected');
  return {
    purpose: 'execution',
    symbol: readResult.request.symbol,
    routeKey: readResult.request.routeKey,
    window: { start: readResult.request.start, end: readResult.request.end },
    ...overrides,
  };
};

const expectSourceError = (action: () => unknown, code: BacktestSnapshotV3SourceError['code']) => {
  try {
    action();
    throw new Error('expected source helper to reject this input');
  } catch (error) {
    expect(error).toBeInstanceOf(BacktestSnapshotV3SourceError);
    expect(error).toMatchObject({ code });
  }
};

describe('backtest V3 Snapshot source builder', () => {
  it('builds the strict actual source and a flat, lossless window-evidence row', () => {
    const readResult = makeReadResult();
    if (readResult.status !== 'selected') throw new Error('unreachable test state');
    const output = createBacktestSnapshotV3Source(planFor(readResult), readResult);

    expect(backtestSnapshotActualSourceV3Schema.parse(output.actualSource)).toEqual(
      output.actualSource,
    );
    expect(output.actualSource).toMatchObject({
      purpose: 'execution',
      symbol: readResult.request.symbol,
      routeKey: readResult.request.routeKey,
      provenance: readResult.selection.response.provenance,
      inputFingerprint: readResult.selection.response.inputFingerprint,
    });
    expect(output.actualSource.provenance).not.toHaveProperty('providerRevision');

    const row = output.evidenceRow;
    expect(row.kind).toBe('market-window-evidence-v3');
    expect(row.purpose).toBe('execution');
    expect(row.symbol).toBe(readResult.request.symbol);
    for (const field of [
      'routeKey',
      'window',
      'request',
      'target',
      'selection',
      'revisions',
      'provenance',
      'seriesVersion',
      'inputFingerprint',
      'coverage',
      'sourcePriceBasis',
      'coverageProof',
      'identityFingerprint',
      'fetchedAt',
    ]) {
      expect(typeof row[field]).toBe('string');
    }
    expect(
      Object.values(row).every(
        (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
      ),
    ).toBe(true);
    expect(JSON.parse(row.routeKey as string)).toEqual(readResult.request.routeKey);
    expect(JSON.parse(row.window as string)).toEqual({
      start: readResult.request.start,
      end: readResult.request.end,
    });
    expect(JSON.parse(row.request as string)).toEqual(readResult.request);
    expect(JSON.parse(row.target as string)).toEqual(readResult.request.routeTarget);
    expect(JSON.parse(row.revisions as string)).toEqual({
      desiredRevision: readResult.selection.desiredRevision,
      effectivePolicyRevision: readResult.selection.effectivePolicyRevision,
      catalogRevision: readResult.selection.catalogRevision,
    });
    expect(JSON.parse(row.seriesVersion as string)).toBe(readResult.seriesVersion);
    expect(JSON.parse(row.inputFingerprint as string)).toBe(
      readResult.selection.response.inputFingerprint,
    );
    expect(JSON.parse(row.sourcePriceBasis as string)).toEqual(
      readResult.selection.response.sourcePriceBasis,
    );
    expect(JSON.parse(row.coverageProof as string)).toEqual(
      readResult.selection.response.coverageProof,
    );
    expect(JSON.parse(row.fetchedAt as string)).toBe('2026-05-20T07:02:00.000Z');
  });

  it('uses existing canonical manifest encoding regardless of input object key order', () => {
    const readResult = makeReadResult();
    if (readResult.status !== 'selected') throw new Error('unreachable test state');
    const expected = createBacktestSnapshotV3Source(planFor(readResult), readResult);
    const reorderedRequest = Object.fromEntries(
      Object.entries(readResult.request).reverse(),
    ) as PinnedMarketWindowRequestV3;
    const reorderedResult = { ...readResult, request: reorderedRequest };
    const actual = createBacktestSnapshotV3Source(planFor(readResult), reorderedResult);

    expect(actual.evidenceRow).toEqual(expected.evidenceRow);
    expect(actual.evidenceRow.request).toBe(canonicalizeManifest(readResult.request));
  });

  it('rejects unavailable, unpinned, unsupported-purpose, or planned-scope-mismatched inputs', () => {
    const readResult = makeReadResult();
    if (readResult.status !== 'selected') throw new Error('unreachable test state');
    const unavailable = {
      status: 'unavailable',
      selection: { status: 'unavailable', reason: 'primary_unavailable' },
    } as MarketBarWindowReadResultV3;
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult), unavailable),
      'window_unavailable',
    );

    const unpinnedRequest = Object.fromEntries(
      Object.entries(readResult.request).filter(([key]) => key !== 'routeTarget'),
    ) as unknown as PinnedMarketWindowRequestV3;
    expectSourceError(
      () =>
        createBacktestSnapshotV3Source(planFor(readResult), {
          ...readResult,
          request: unpinnedRequest,
        }),
      'request_unpinned',
    );
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult, { purpose: 'signal' }), readResult),
      'unsupported_purpose',
    );
    expectSourceError(
      () =>
        createBacktestSnapshotV3Source(planFor(readResult, { symbol: '600519.SH' }), readResult),
      'planned_scope_mismatch',
    );
    expectSourceError(
      () =>
        createBacktestSnapshotV3Source(
          planFor(readResult, {
            routeKey: { ...readResult.request.routeKey, adjustment: 'none' },
          }),
          readResult,
        ),
      'planned_scope_mismatch',
    );
    expectSourceError(
      () =>
        createBacktestSnapshotV3Source(
          planFor(readResult, { window: { start: '2026-05-17', end: '2026-05-20' } }),
          readResult,
        ),
      'planned_scope_mismatch',
    );
  });

  it('rejects response/provenance and stored-evidence mismatches', () => {
    const readResult = makeReadResult();
    if (readResult.status !== 'selected') throw new Error('unreachable test state');

    const wrongSelection = {
      ...readResult,
      selection: { ...readResult.selection, routeIndex: 1 },
    } as MarketBarWindowReadResultV3;
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult), wrongSelection),
      'reader_evidence_mismatch',
    );

    const wrongTarget = structuredClone(readResult);
    if (wrongTarget.status !== 'selected') throw new Error('unreachable test state');
    wrongTarget.selection.target.providerId = 'synthetic-other-provider';
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult), wrongTarget),
      'reader_evidence_mismatch',
    );

    const wrongEvidence = {
      ...readResult,
      evidence: { ...readResult.evidence, catalogRevision: 99 },
    } as MarketBarWindowReadResultV3;
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult), wrongEvidence),
      'reader_evidence_mismatch',
    );

    const wrongCoverage = structuredClone(readResult);
    if (wrongCoverage.status !== 'selected') throw new Error('unreachable test state');
    wrongCoverage.selection.response.coverage.requestedStart = '2026-05-19';
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult), wrongCoverage),
      'reader_contract_invalid',
    );

    const partialWindow = structuredClone(readResult);
    if (partialWindow.status !== 'selected') throw new Error('unreachable test state');
    partialWindow.selection.response.bars.splice(1, 1);
    expectSourceError(
      () => createBacktestSnapshotV3Source(planFor(readResult), partialWindow),
      'reader_contract_invalid',
    );
  });
});
