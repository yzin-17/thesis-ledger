import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type MarketBarWindowEvidenceV3 as PrismaEvidenceV3 } from '@prisma/client';
import {
  marketDataBarSeriesRequestV3Schema,
  marketDataBarRouteKeyV3Schema,
  marketCoverageProofV3Schema,
  marketRouteKeyIdV3,
  sourcePriceBasisSchema,
  type MarketCoverageProofV3,
  type MarketDataBarRouteKeyV3,
  type MarketDataBarSeriesRequestV3,
  type MarketDataBarSeriesResponseV3,
  type MarketDataRouteTargetPinV3,
  type SourcePriceBasisFact,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import {
  marketFrozenWindowHashV3,
  marketWindowSeriesVersionV3,
} from './market-frozen-window-v3.js';
import { PrismaService } from '../platform/prisma.service.js';
import { parseMarketWindowEvidenceResponseV3 } from './market-window-response-v3.js';
import {
  backfillMarketWindowEvidenceV3,
  insertMarketWindowEvidenceV3,
} from './market-window-evidence-v3-jsonb.js';

const nonEmptyText = z.string().trim().min(1);
const positiveRevision = z.number().int().positive().max(2_147_483_647);
const positiveCatalogRevision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const catalogRevisionFromDb = (value: bigint): number => {
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('已存 Catalog revision 不在协议安全整数范围内');
  return Number(value);
};

export type PinnedMarketWindowRequestV3 = MarketDataBarSeriesRequestV3 & {
  routeTarget: MarketDataRouteTargetPinV3;
};

type MarketWindowEvidenceV3Revisions = {
  desiredRevision: number;
  effectivePolicyRevision: number;
  catalogRevision: number;
};

export type MarketWindowEvidenceV3Identity = {
  request: PinnedMarketWindowRequestV3;
  seriesVersion: string;
  inputFingerprint: string;
} & MarketWindowEvidenceV3Revisions;

export type RecordMarketWindowEvidenceV3Input = Omit<
  MarketWindowEvidenceV3Identity,
  'inputFingerprint'
> & {
  response: MarketDataBarSeriesResponseV3;
  fetchedAt?: Date;
};

export type StoredMarketWindowEvidenceV3 = {
  identityFingerprint: string;
  completeResponseHash?: string;
  routeKey: MarketDataBarRouteKeyV3;
  target: MarketDataRouteTargetPinV3;
  symbol: string;
  window: { start: string; end: string };
  seriesVersion: string;
  inputFingerprint: string;
  desiredRevision: number;
  effectivePolicyRevision: number;
  catalogRevision: number;
  sourcePriceBasis: SourcePriceBasisFact;
  coverageProof: MarketCoverageProofV3;
  fetchedAt: Date;
};

type NormalizedIdentity = MarketWindowEvidenceV3Identity & {
  request: PinnedMarketWindowRequestV3;
  inputFingerprint: string;
  seriesVersion: string;
};

const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const dateOnly = (value: Date | string): string =>
  (typeof value === 'string' ? new Date(value) : value).toISOString().slice(0, 10);

const normalizeRequest = (value: unknown): PinnedMarketWindowRequestV3 => {
  const request = marketDataBarSeriesRequestV3Schema.parse(value);
  if (!request.routeTarget) throw new Error('V3 行情窗口证据必须使用固定 RouteTarget 请求');
  return request as PinnedMarketWindowRequestV3;
};

const normalizeIdentity = (input: MarketWindowEvidenceV3Identity): NormalizedIdentity => {
  const request = normalizeRequest(input.request);
  const seriesVersion = nonEmptyText.parse(input.seriesVersion);
  const inputFingerprint = nonEmptyText.parse(input.inputFingerprint);
  return {
    request,
    seriesVersion,
    inputFingerprint,
    desiredRevision: positiveRevision.parse(input.desiredRevision),
    effectivePolicyRevision: positiveRevision.parse(input.effectivePolicyRevision),
    catalogRevision: positiveCatalogRevision.parse(input.catalogRevision),
  };
};

const identityFingerprint = (identity: NormalizedIdentity): string => {
  const target = identity.request.routeTarget;
  return createHash('sha256')
    .update(
      JSON.stringify([
        'market-bar-window-evidence-v3',
        marketRouteKeyIdV3(identity.request.routeKey),
        [target.providerId, target.upstreamSource, target.routeIndex],
        identity.request.symbol,
        [identity.request.start, identity.request.end],
        identity.seriesVersion,
        identity.inputFingerprint,
        [identity.desiredRevision, identity.effectivePolicyRevision, identity.catalogRevision],
        ...(identity.request.tradabilityMode ? [identity.request.tradabilityMode] : []),
      ]),
    )
    .digest('hex');
};

const rowMatchesIdentity = (row: PrismaEvidenceV3, identity: NormalizedIdentity): boolean => {
  const target = identity.request.routeTarget;
  const routeKey = identity.request.routeKey;
  return (
    row.routeKind === routeKey.kind &&
    row.market === routeKey.market &&
    row.assetType === routeKey.assetType &&
    row.capability === routeKey.capability &&
    row.timeframe === routeKey.timeframe &&
    row.adjustment === routeKey.adjustment &&
    row.providerId === target.providerId &&
    row.upstreamSource === target.upstreamSource &&
    row.routeIndex === target.routeIndex &&
    row.symbol === identity.request.symbol &&
    dateOnly(row.requestedStart) === identity.request.start &&
    dateOnly(row.requestedEnd) === identity.request.end &&
    row.seriesVersion === identity.seriesVersion &&
    row.inputFingerprint === identity.inputFingerprint &&
    row.desiredRevision === identity.desiredRevision &&
    row.effectivePolicyRevision === identity.effectivePolicyRevision &&
    row.catalogRevision === BigInt(identity.catalogRevision)
  );
};

const toStoredEvidence = (
  row: PrismaEvidenceV3,
  identity: NormalizedIdentity,
): StoredMarketWindowEvidenceV3 => {
  if (!rowMatchesIdentity(row, identity)) {
    throw new MarketWindowEvidenceV3IdentityConflictError();
  }
  const routeKey = marketDataBarRouteKeyV3Schema.parse({
    kind: row.routeKind,
    market: row.market,
    assetType: row.assetType,
    capability: row.capability,
    timeframe: row.timeframe,
    adjustment: row.adjustment,
  });
  const sourcePriceBasis = sourcePriceBasisSchema.parse(row.sourcePriceBasis);
  const coverageProof = marketCoverageProofV3Schema.parse(row.coverageProof);
  if (
    sourcePriceBasis.adjustment !== routeKey.adjustment ||
    coverageProof.calendar.market !== routeKey.market ||
    coverageProof.listing.symbol !== row.symbol ||
    coverageProof.window.requestedStart !== identity.request.start ||
    coverageProof.window.requestedEnd !== identity.request.end
  ) {
    throw new Error('已存 V3 行情窗口证据与其 RouteKey 或窗口不一致');
  }
  return {
    identityFingerprint: row.identityFingerprint,
    ...(row.completeResponseHash ? { completeResponseHash: row.completeResponseHash } : {}),
    routeKey,
    target: {
      providerId: row.providerId,
      upstreamSource: row.upstreamSource,
      routeIndex: row.routeIndex,
    },
    symbol: row.symbol,
    window: { start: identity.request.start, end: identity.request.end },
    seriesVersion: row.seriesVersion,
    inputFingerprint: row.inputFingerprint,
    desiredRevision: row.desiredRevision,
    effectivePolicyRevision: row.effectivePolicyRevision,
    catalogRevision: catalogRevisionFromDb(row.catalogRevision),
    sourcePriceBasis,
    coverageProof,
    fetchedAt: row.fetchedAt,
  };
};

const buildCreateData = (
  identity: NormalizedIdentity,
  response: MarketDataBarSeriesResponseV3,
  fetchedAt: Date,
): Prisma.MarketBarWindowEvidenceV3CreateInput & { completeResponseHash: string } => {
  const routeKey = identity.request.routeKey;
  const target = identity.request.routeTarget;
  return {
    identityFingerprint: identityFingerprint(identity),
    routeKind: routeKey.kind,
    market: routeKey.market,
    assetType: routeKey.assetType,
    capability: routeKey.capability,
    timeframe: routeKey.timeframe,
    adjustment: routeKey.adjustment,
    symbol: identity.request.symbol,
    providerId: target.providerId,
    upstreamSource: target.upstreamSource,
    routeIndex: target.routeIndex,
    requestedStart: toDate(identity.request.start),
    requestedEnd: toDate(identity.request.end),
    seriesVersion: identity.seriesVersion,
    inputFingerprint: identity.inputFingerprint,
    desiredRevision: identity.desiredRevision,
    effectivePolicyRevision: identity.effectivePolicyRevision,
    catalogRevision: BigInt(identity.catalogRevision),
    sourcePriceBasis: response.sourcePriceBasis,
    coverageProof: response.coverageProof,
    completeResponse: response,
    completeResponseHash: marketFrozenWindowHashV3(response),
    fetchedAt,
  };
};

const assertExactSeriesVersion = (
  request: PinnedMarketWindowRequestV3,
  response: MarketDataBarSeriesResponseV3,
  seriesVersion: string,
) => {
  if (marketWindowSeriesVersionV3(request, response) !== seriesVersion) {
    throw new Error('V3 行情窗口 seriesVersion 与来源基准、目标、窗口或 Bars 不一致');
  }
};

const sameEvidence = (
  row: PrismaEvidenceV3,
  data: Prisma.MarketBarWindowEvidenceV3CreateInput,
): boolean =>
  row.identityFingerprint === data.identityFingerprint &&
  row.routeKind === data.routeKind &&
  row.market === data.market &&
  row.assetType === data.assetType &&
  row.capability === data.capability &&
  row.timeframe === data.timeframe &&
  row.adjustment === data.adjustment &&
  row.symbol === data.symbol &&
  row.providerId === data.providerId &&
  row.upstreamSource === data.upstreamSource &&
  row.routeIndex === data.routeIndex &&
  dateOnly(row.requestedStart) === dateOnly(data.requestedStart) &&
  dateOnly(row.requestedEnd) === dateOnly(data.requestedEnd) &&
  row.seriesVersion === data.seriesVersion &&
  row.inputFingerprint === data.inputFingerprint &&
  row.desiredRevision === data.desiredRevision &&
  row.effectivePolicyRevision === data.effectivePolicyRevision &&
  row.catalogRevision === data.catalogRevision &&
  isDeepStrictEqual(row.sourcePriceBasis, data.sourcePriceBasis) &&
  isDeepStrictEqual(row.coverageProof, data.coverageProof);

export class MarketWindowEvidenceV3IdentityConflictError extends Error {
  constructor() {
    super('相同行情窗口证据身份对应了不同的来源证明，拒绝覆盖');
    this.name = 'MarketWindowEvidenceV3IdentityConflictError';
  }
}

@Injectable()
export class MarketWindowEvidenceV3Repository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: RecordMarketWindowEvidenceV3Input): Promise<StoredMarketWindowEvidenceV3> {
    const request = normalizeRequest(input.request);
    const response = parseMarketWindowEvidenceResponseV3(input.response, request);
    if (
      request.start !== response.coverage.requestedStart ||
      request.end !== response.coverage.requestedEnd
    ) {
      throw new Error('V3 行情响应覆盖窗口必须与固定请求窗口完全一致');
    }
    const effectivePolicyRevision = positiveRevision.parse(input.effectivePolicyRevision);
    if (response.provenance.effectivePolicyRevision !== effectivePolicyRevision) {
      throw new Error('V3 行情 response provenance revision 与所选 Effective revision 不一致');
    }
    assertExactSeriesVersion(request, response, input.seriesVersion);
    const identity = normalizeIdentity({
      request,
      seriesVersion: input.seriesVersion,
      inputFingerprint: response.inputFingerprint,
      desiredRevision: input.desiredRevision,
      effectivePolicyRevision,
      catalogRevision: input.catalogRevision,
    });
    const fetchedAt = input.fetchedAt ?? new Date();
    if (!(fetchedAt instanceof Date) || !Number.isFinite(fetchedAt.getTime())) {
      throw new Error('fetchedAt 必须是有效的 Date');
    }
    const data = buildCreateData(identity, response, fetchedAt);

    const created = await insertMarketWindowEvidenceV3(this.prisma, data);
    if (created) return toStoredEvidence(created, identity);
    let existing = await this.prisma.marketBarWindowEvidenceV3.findUnique({
      where: { identityFingerprint: data.identityFingerprint },
    });
    if (!existing || !sameEvidence(existing, data)) {
      throw new MarketWindowEvidenceV3IdentityConflictError();
    }
    if (existing.completeResponse === null && existing.completeResponseHash === null) {
      await backfillMarketWindowEvidenceV3(
        this.prisma,
        data.identityFingerprint,
        response,
        data.completeResponseHash,
      );
      existing = await this.prisma.marketBarWindowEvidenceV3.findUnique({
        where: { identityFingerprint: data.identityFingerprint },
      });
    }
    if (
      !existing ||
      !sameEvidence(existing, data) ||
      existing.completeResponseHash !== data.completeResponseHash ||
      marketFrozenWindowHashV3(existing.completeResponse) !== existing.completeResponseHash
    ) {
      throw new MarketWindowEvidenceV3IdentityConflictError();
    }
    return toStoredEvidence(existing, identity);
  }

  async findFrozen(fingerprint: string) {
    const id = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(fingerprint);
    const row = await this.prisma.marketBarWindowEvidenceV3.findUnique({
      where: { identityFingerprint: id },
    });
    if (!row) return null;
    if (row.completeResponse === null && row.completeResponseHash === null) return null;
    if (
      !row.completeResponseHash ||
      marketFrozenWindowHashV3(row.completeResponse) !== row.completeResponseHash
    ) {
      throw new MarketWindowEvidenceV3IdentityConflictError();
    }
    const response = parseMarketWindowEvidenceResponseV3(row.completeResponse);
    const request = normalizeRequest({
      contractVersion: 3,
      requestId: response.requestId,
      symbol: row.symbol,
      routeKey: {
        kind: row.routeKind,
        market: row.market,
        assetType: row.assetType,
        capability: row.capability,
        timeframe: row.timeframe,
        adjustment: row.adjustment,
      },
      start: dateOnly(row.requestedStart),
      end: dateOnly(row.requestedEnd),
      ...(row.completeResponse && typeof row.completeResponse === 'object' && 'historicalTradabilityWindows' in row.completeResponse
        ? { tradabilityMode: 'assume-untradable-no-bar' } : {}),
      routeTarget: {
        providerId: row.providerId,
        upstreamSource: row.upstreamSource,
        routeIndex: row.routeIndex,
      },
    });
    parseMarketWindowEvidenceResponseV3(response, request);
    assertExactSeriesVersion(request, response, row.seriesVersion);
    const identity = normalizeIdentity({
      request,
      seriesVersion: row.seriesVersion,
      inputFingerprint: response.inputFingerprint,
      desiredRevision: row.desiredRevision,
      effectivePolicyRevision: row.effectivePolicyRevision,
      catalogRevision: catalogRevisionFromDb(row.catalogRevision),
    });
    if (
      row.identityFingerprint !== id ||
      identityFingerprint(identity) !== id ||
      response.provenance.effectivePolicyRevision !== row.effectivePolicyRevision ||
      !isDeepStrictEqual(row.sourcePriceBasis, response.sourcePriceBasis) ||
      !isDeepStrictEqual(row.coverageProof, response.coverageProof) ||
      response.coverage.requestedStart !== request.start ||
      response.coverage.requestedEnd !== request.end
    ) {
      throw new MarketWindowEvidenceV3IdentityConflictError();
    }
    return {
      request,
      response,
      seriesVersion: row.seriesVersion,
      completeResponseHash: row.completeResponseHash,
      evidence: toStoredEvidence(row, identity),
    };
  }

  async findExact(
    input: MarketWindowEvidenceV3Identity,
  ): Promise<StoredMarketWindowEvidenceV3 | null> {
    const identity = normalizeIdentity(input);
    const row = await this.prisma.marketBarWindowEvidenceV3.findUnique({
      where: { identityFingerprint: identityFingerprint(identity) },
    });
    if (!row) return null;
    return toStoredEvidence(row, identity);
  }
}
