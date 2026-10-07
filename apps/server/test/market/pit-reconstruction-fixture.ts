import { readFileSync } from 'node:fs';
import type { MarketBarWindowEvidenceV3, Prisma } from '@prisma/client';
import {
  marketDataBarSeriesResponseV3Schema,
  marketPitReconstructionProofV3Schema,
} from '@thesis-ledger/schemas';
import { vi } from 'vitest';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import {
  MarketWindowEvidenceV3Repository,
  type PinnedMarketWindowRequestV3,
} from '../../src/market/market-window-evidence-v3.repository.js';
import { marketWindowSeriesVersionV3 } from '../../src/market/market-frozen-window-v3.js';
import { decodeMarketWindowEvidenceInsert } from './market-window-evidence-v3-sql-mock.js';

/** 仅替换数据库端口；归档创建、身份及读回使用真实 repository。 */
export const pitReconstructionFixture = async () => {
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
  response.sourcePriceBasis.anchor = '2026-05-18';
  const request: PinnedMarketWindowRequestV3 = {
    contractVersion: 3,
    requestId: response.requestId,
    symbol: response.symbol,
    routeKey: response.routeKey,
    start: response.coverage.requestedStart,
    end: response.coverage.requestedEnd,
    routeTarget: {
      providerId: response.provenance.providerId,
      upstreamSource: response.provenance.upstreamSource,
      routeIndex: response.provenance.routeIndex,
    },
  };
  const input = {
    request,
    response,
    seriesVersion: marketWindowSeriesVersionV3(request, response),
    dataAsOf: '2026-05-21T08:00:00.000Z',
  };
  const rows = new Map<string, MarketBarWindowEvidenceV3>();
  const findUnique = vi.fn(
    async ({ where }: { where: { identityFingerprint: string } }) =>
      rows.get(where.identityFingerprint) ?? null,
  );
  const create = vi.fn(async ({ data }: { data: unknown }) => {
    const row = structuredClone(data) as MarketBarWindowEvidenceV3;
    rows.set(row.identityFingerprint, row);
    return row;
  });
  const windows = new MarketWindowEvidenceV3Repository({
    marketBarWindowEvidenceV3: { findUnique, create },
    $queryRaw: vi.fn(async (statement: Prisma.Sql) => [
      await create({ data: decodeMarketWindowEvidenceInsert(statement) }),
    ]),
  } as unknown as PrismaService);
  const record = async (
    value = structuredClone(input),
    fetchedAt = new Date('2026-05-20T07:02:00.000Z'),
  ) =>
    windows.record({
      request: value.request,
      response: value.response,
      seriesVersion: marketWindowSeriesVersionV3(value.request, value.response),
      desiredRevision: 1,
      effectivePolicyRevision: value.response.provenance.effectivePolicyRevision,
      catalogRevision: 1,
      fetchedAt,
    });
  const evidence = await record();
  const proof = marketPitReconstructionProofV3Schema.parse({
    contractVersion: 1,
    kind: 'market-pit-reconstruction',
    symbol: request.symbol,
    routeKey: request.routeKey,
    target: request.routeTarget,
    window: { start: request.start, end: request.end },
    seriesVersion: input.seriesVersion,
    inputFingerprint: response.inputFingerprint,
    sourcePriceBasis: response.sourcePriceBasis,
    dataAsOf: input.dataAsOf,
    barArchives: response.bars.map((bar) => ({
      timestamp: bar.timestamp,
      windowIdentityFingerprint: evidence.identityFingerprint,
      completeResponseHash: evidence.completeResponseHash,
    })),
  });
  const pointTo = (value: typeof evidence) =>
    proof.barArchives.forEach((reference) => {
      reference.windowIdentityFingerprint = value.identityFingerprint;
      reference.completeResponseHash = value.completeResponseHash!;
    });
  const partitionAtOriginalObservation = async () => {
    for (const bar of input.response.bars)
      bar.availableAt = new Date(Date.parse(bar.timestamp) + 60_000).toISOString();
    input.response.sourcePriceBasis.observedAt = input.response.bars.at(-1)!.availableAt;
    proof.sourcePriceBasis = structuredClone(input.response.sourcePriceBasis);
    for (const [index, bar] of input.response.bars.entries()) {
      const daily = structuredClone(input);
      const day = bar.timestamp.slice(0, 10);
      daily.request.start = daily.request.end = day;
      daily.response.bars = [bar];
      daily.response.sourcePriceBasis.observedAt = bar.availableAt;
      daily.response.inputFingerprint = `source-time-${day}`;
      daily.response.coverage = {
        requestedStart: day,
        requestedEnd: day,
        actualStart: bar.timestamp,
        actualEnd: bar.timestamp,
        hasMoreBefore: false,
        latestCompleteTradingDate: day,
      };
      daily.response.coverageProof.window.requestedStart =
        daily.response.coverageProof.window.requestedEnd = day;
      daily.response.coverageProof.calendar.expectedSessionDates = [day];
      const stored = await record(daily, new Date(Date.parse(bar.availableAt) + 10));
      proof.barArchives[index]!.windowIdentityFingerprint = stored.identityFingerprint;
      proof.barArchives[index]!.completeResponseHash = stored.completeResponseHash!;
    }
  };
  return {
    input,
    proof,
    windows,
    rows,
    findUnique,
    create,
    record,
    evidence,
    pointTo,
    partitionAtOriginalObservation,
  };
};
