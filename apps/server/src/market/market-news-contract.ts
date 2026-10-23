import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  marketNewsReadInputSchema,
  marketNewsRequestV3Schema,
  type MarketNewsResult,
  type MarketNewsReadError,
  type MarketNewsResponseV3,
  type MarketNewsRequestV3,
} from '@thesis-ledger/schemas';

export type {
  MarketNewsReadInput,
  MarketNewsReadError,
  MarketNewsResult,
} from '@thesis-ledger/schemas';

export function prepareMarketNewsRequest(input: unknown): MarketNewsRequestV3 {
  const parsed = marketNewsReadInputSchema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException({
      error: 'INVALID_MARKET_NEWS_REQUEST',
      message: '请提供规范新闻标的、时间窗口与有效预算',
    });
  const request = marketNewsRequestV3Schema.safeParse({
    ...parsed.data,
    requestId: crypto.randomUUID(),
  });
  if (!request.success)
    throw new BadRequestException({
      error: 'INVALID_MARKET_NEWS_REQUEST',
      message: '新闻发布时间窗口无效',
    });
  return request.data;
}

function newsCacheIdentity(request: MarketNewsRequestV3, response: MarketNewsResponseV3) {
  if (response.route === null || response.status === 'unavailable') return null;
  const scope = {
    contractVersion: response.contractVersion,
    instrument: request.instrument,
    publishedStart: request.publishedStart,
    publishedEnd: request.publishedEnd,
    limit: request.limit,
    cursor: request.cursor,
    requestBudgetMs: request.requestBudgetMs,
    providerId: response.route.providerId,
    upstreamSource: response.route.upstreamSource,
    policyRevision: response.route.policyRevision,
    routeRevision: response.route.routeRevision,
    credentialRevision: response.route.credentialRevision,
  };
  return `market-news-v1:${createHash('sha256').update(JSON.stringify(scope)).digest('hex')}`;
}

export function marketNewsResult(
  request: MarketNewsRequestV3,
  response: MarketNewsResponseV3,
): MarketNewsResult {
  return {
    instrument: response.instrument,
    status: response.status,
    items: response.items,
    coverage: response.coverage,
    errors: response.errors,
    source: response.route,
    fetchedAt: response.fetchedAt,
    upstreamAttempts: response.upstreamAttempts,
    nextCursor: response.nextCursor,
    cacheIdentity: newsCacheIdentity(request, response),
  };
}

export function unavailableMarketNews(
  request: MarketNewsRequestV3,
  error: MarketNewsReadError,
): MarketNewsResult {
  return {
    instrument: request.instrument,
    status: 'unavailable',
    items: [],
    source: null,
    fetchedAt: null,
    upstreamAttempts: null,
    nextCursor: null,
    cacheIdentity: null,
    errors: [error],
    coverage: {
      basis: 'current-search',
      publishedStart: request.publishedStart,
      publishedEnd: request.publishedEnd,
      complete: false,
      truncated: false,
      unknownPublishedTimeCount: 0,
      examinedCount: null,
      returnedCount: 0,
      uniqueEvidenceCount: 0,
      missingReasons: [error.code],
    },
  };
}
