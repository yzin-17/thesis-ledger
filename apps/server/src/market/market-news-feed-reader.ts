import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  marketNewsFeedReadInputSchema,
  marketNewsFeedRequestV3Schema,
  type MarketNewsFeedRequestV3,
  type MarketNewsFeedResponseV3,
  type MarketNewsFeedResult,
} from '@thesis-ledger/schemas';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import { DsaNewsFeedError, readDsaNewsFeedV3 } from '../integration/dsa/dsa-news-feed-v3.js';

export function projectMarketNewsFeed(
  request: MarketNewsFeedRequestV3,
  response: MarketNewsFeedResponseV3,
): MarketNewsFeedResult {
  const {
    market,
    status,
    items,
    coverage,
    errors,
    route,
    fetchedAt,
    upstreamAttempts,
    nextCursor,
  } = response;
  const scope = { ...request, requestId: undefined };
  return {
    market,
    status,
    items,
    coverage,
    errors,
    source: route,
    fetchedAt,
    upstreamAttempts,
    nextCursor,
    cacheIdentity:
      status === 'unavailable' || route === null
        ? null
        : 'market-news-feed-v1:' +
          createHash('sha256')
            .update(JSON.stringify({ request: scope, route }))
            .digest('hex'),
  };
}

function unavailable(request: MarketNewsFeedRequestV3, error: DsaError): MarketNewsFeedResult {
  let code:
    | 'invalid_response'
    | 'service_unauthorized'
    | 'service_unavailable'
    | 'timeout'
    | 'unsupported' = 'service_unavailable';
  if (error.code === 'invalid-response') code = 'invalid_response';
  else if (error.code === 'unauthorized') code = 'service_unauthorized';
  else if (error.code === 'timeout') code = 'timeout';
  else if (error.code === 'unsupported-capability') code = 'unsupported';
  return {
    market: request.market,
    status: 'unavailable',
    items: [],
    source: null,
    fetchedAt: null,
    upstreamAttempts: null,
    nextCursor: null,
    cacheIdentity: null,
    errors: [{ code, message: '市场快讯暂时无法读取', providerId: null, upstreamSource: null }],
    coverage: {
      basis: 'current-feed',
      publishedStart: request.publishedStart,
      publishedEnd: request.publishedEnd,
      complete: false,
      truncated: false,
      unknownPublishedTimeCount: 0,
      examinedCount: null,
      returnedCount: 0,
      uniqueEvidenceCount: 0,
      missingReasons: [code],
    },
  };
}

@Injectable()
export class MarketNewsFeedReader {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  async read(input: unknown, signal?: AbortSignal): Promise<MarketNewsFeedResult> {
    signal?.throwIfAborted();
    const parsed = marketNewsFeedReadInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('请提供有效的快讯市场、来源与时间窗口');
    const request = marketNewsFeedRequestV3Schema.parse({
      ...parsed.data,
      requestId: randomUUID(),
    });
    request.requestBudgetMs = Math.min(request.requestBudgetMs, this.dsa.timeoutMs);
    try {
      return projectMarketNewsFeed(request, await readDsaNewsFeedV3(this.dsa, request, signal));
    } catch (error) {
      if (error instanceof DsaNewsFeedError) return projectMarketNewsFeed(request, error.response);
      if (error instanceof DsaError) return unavailable(request, error);
      throw error;
    }
  }
}
