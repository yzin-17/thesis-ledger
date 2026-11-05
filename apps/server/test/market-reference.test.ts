import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { marketReferenceCatalog, type MarketReferenceRequest } from '@thesis-ledger/schemas';
import { MarketReferenceController } from '../src/market/market-reference.controller.js';
import { DsaError, type DsaClient } from '../src/integration/dsa/dsa.client.js';

function response(q: MarketReferenceRequest) {
  const scope = { ...q };
  Reflect.deleteProperty(scope, 'requestBudgetMs');
  return {
    ...scope,
    dataVersion: 'market-reference-v1',
    adapterRevision: 'market-reference-projection-v1',
    sourceRevision: 'sina-original-finance-report-v1',
    providerId: 'akshare',
    upstreamSource: 'sina',
    fetchedAt: '2026-11-03T12:00:00Z',
    sourceUrl: 'https://quotes.sina.cn/',
    columns: marketReferenceCatalog['financial-balance'].columns,
    items: [],
    status: 'empty',
    hasMore: false,
    nextCursor: null,
    totalSourceRecords: 0,
    historyComplete: false,
    notes: ['未声明历史完整性。'],
    policyRevision: 1,
    routeTarget: { providerId: 'akshare', upstreamSource: 'sina', routeIndex: 0 },
  };
}
const http = () => new EventEmitter() as Request;
const input = { dataset: 'financial-balance', symbol: '600519.SH' };

describe('市场资料 Server 接缝', () => {
  it('沿用 DSA 传输预算、来源错误映射和取消信号，不重试', async () => {
    const post = vi
      .fn()
      .mockImplementation(async (_path, query: MarketReferenceRequest) => response(query));
    const dsa = { post, timeoutMs: 120000 } as unknown as DsaClient;
    const request = http();
    const result = await new MarketReferenceController(dsa).read(input, {}, request);
    expect(result.status).toBe('empty');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[2]).toBe(1);
    expect(post.mock.calls[0]?.[4]).toBe(60000);
    expect(post.mock.calls[0]?.[5]).toBeInstanceOf(AbortSignal);
    expect(request.listenerCount('aborted')).toBe(0);
  });
  it('拒绝错误证券和来源修订，不转为空态', async () => {
    const post = vi
      .fn()
      .mockImplementation(async (_path, query: MarketReferenceRequest) => ({
        ...response(query),
        symbol: '000001.SZ',
      }));
    const controller = new MarketReferenceController({
      post,
      timeoutMs: 120000,
    } as unknown as DsaClient);
    await expect(controller.read(input, {}, http())).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('不合法输入不会触发来源请求，来源失败保留错误', async () => {
    const post = vi
      .fn()
      .mockRejectedValue(new DsaError('内部错误正文', 'unavailable', 429, 'rate_limited'));
    const controller = new MarketReferenceController({
      post,
      timeoutMs: 120000,
    } as unknown as DsaClient);
    await expect(
      controller.read({ ...input, url: 'https://example.com' }, {}, http()),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    await expect(controller.read(input, {}, http())).rejects.toThrow('资料来源暂不可读');
    expect(post).toHaveBeenCalledTimes(1);
  });
});
