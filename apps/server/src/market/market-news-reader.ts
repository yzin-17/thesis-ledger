import { Inject, Injectable } from '@nestjs/common';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import { DsaNewsError } from '../integration/dsa/dsa-news-v3.js';
import {
  marketNewsResult,
  prepareMarketNewsRequest,
  unavailableMarketNews,
  type MarketNewsReadError,
  type MarketNewsResult,
} from './market-news-contract.js';

function serviceError(error: DsaError): MarketNewsReadError {
  const base = { providerId: null, upstreamSource: null };
  if (error.code === 'unsupported-capability')
    return { ...base, code: 'unsupported', message: '数据服务尚不支持新闻检索' };
  if (error.code === 'unauthorized')
    return { ...base, code: 'service_unauthorized', message: '新闻数据服务鉴权不可用' };
  if (error.code === 'invalid-response')
    return { ...base, code: 'invalid_response', message: '新闻数据响应未通过合同核验' };
  if (error.code === 'timeout')
    return { ...base, code: 'timeout', message: '新闻取数超过请求预算' };
  return { ...base, code: 'service_unavailable', message: '新闻数据服务暂时不可用' };
}

@Injectable()
export class MarketNewsReader {
  constructor(@Inject(DsaClient) private readonly dsa: DsaClient) {}

  async read(input: unknown, signal?: AbortSignal): Promise<MarketNewsResult> {
    signal?.throwIfAborted();
    const request = prepareMarketNewsRequest(input);
    request.requestBudgetMs = Math.min(request.requestBudgetMs, this.dsa.timeoutMs);
    try {
      return marketNewsResult(request, await this.dsa.marketNewsV3(request, signal));
    } catch (error) {
      if (error instanceof DsaNewsError) return marketNewsResult(request, error.response);
      if (error instanceof DsaError) return unavailableMarketNews(request, serviceError(error));
      throw error;
    }
  }
}
