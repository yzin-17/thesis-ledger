import type { MarketCacheContextRequestV3, MarketCacheContextResponseV3 } from '@thesis-ledger/schemas';
import { DsaError, type DsaClient } from '../integration/dsa/dsa.client.js';

type CacheInput<T = MarketCacheContextRequestV3> = T extends MarketCacheContextRequestV3
  ? Omit<T, 'contractVersion' | 'consumer' | 'requestId'> : never;

/** 当前数据缓存的控制围栏；控制事实由原DSA Runtime投影。 */
export class MarketCacheControl {
  constructor(private readonly dsa: Pick<DsaClient, 'marketCacheContextV3'>) {}

  async read(input: CacheInput, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const request = { ...input, contractVersion: 3, consumer: 'thesis-ledger', requestId: crypto.randomUUID() } as MarketCacheContextRequestV3;
    const context = await this.dsa.marketCacheContextV3(request, signal);
    if (!context.ready) throw new DsaError('当前功能未启用或来源不可用', 'control-rejected');
    return { input, context };
  }

  async assertCurrent(scope: Awaited<ReturnType<MarketCacheControl['read']>>, signal?: AbortSignal) {
    const current = await this.read(scope.input, signal);
    if (current.context.generation !== scope.context.generation)
      throw new DsaError('当前数据读取期间控制代次已变化', 'stale-revision');
  }
}

export type MarketCacheScope = { input: CacheInput;
  context: MarketCacheContextResponseV3 };
