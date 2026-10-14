import { describe, expect, it, vi } from 'vitest';
import { securityLotSizeResponseSchema } from '@thesis-ledger/schemas';
import { readSecurityLotSize } from '../src/integration/dsa/dsa-security-lot-size.js';
import { MarketSecurityLotSizeController } from '../src/market/market-security-lot-size.controller.js';
import type { DsaClient } from '../src/integration/dsa/dsa.client.js';

const response = (requestId: string) => ({
  contractVersion: 3, consumer: 'thesis-ledger', requestId, symbol: '00700.HK',
  sharesPerLot: '100', historicalChanges: 'unverified',
  source: { provider: 'futu', sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
    sha256: 'a'.repeat(64), observedAt: '2026-10-08T10:00:00Z' },
  fetchedAt: '2026-10-08T10:01:00Z', policyRevision: 2,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 1 },
});

describe('独立每手股数产品读取', () => {
  it('只调用独立 Data 入口，保留实际主备来源且绑定请求', async () => {
    const post = vi.fn(async (_path, request) => response(request.requestId));
    const value = await readSecurityLotSize({ post } as unknown as DsaClient, '700.HK');
    expect(post.mock.calls[0]?.slice(0, 3)).toEqual([
      '/api/v3/thesis-ledger/market/security-lot-size',
      { contractVersion: 3, consumer: 'thesis-ledger', requestId: value.requestId, symbol: '00700.HK' }, 1,
    ]);
    expect(value.routeTarget.routeIndex).toBe(1);
  });
  it.each(['symbol', 'requestId'])('拒绝不匹配的 %s', async field => {
    const post = vi.fn(async (_path, request) => ({ ...response(request.requestId), [field]: field === 'symbol' ? '00147.HK' : 'other' }));
    await expect(readSecurityLotSize({ post } as unknown as DsaClient, '00700.HK')).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it.each(['0', '-1', '1.5', 'NaN'])('拒绝非法每手股数 %s', sharesPerLot => {
    expect(securityLotSizeResponseSchema.safeParse({ ...response('x'), sharesPerLot }).success).toBe(false);
  });
  it('拒绝来源不一致及晚于返回的观察时间', () => {
    const value = response('x');
    expect(securityLotSizeResponseSchema.safeParse({ ...value, source: { ...value.source, provider: 'longbridge' } }).success).toBe(false);
    expect(securityLotSizeResponseSchema.safeParse({ ...value, source: { ...value.source, observedAt: '2026-10-09T00:00:00Z' } }).success).toBe(false);
  });
  it('产品入口只接受港股代码，不发起无效请求', () => {
    const post = vi.fn();
    const controller = new MarketSecurityLotSizeController({ post } as unknown as DsaClient);
    expect(() => controller.read('AAPL.US')).toThrow('港股股票代码');
    expect(() => controller.read()).toThrow('港股股票代码');
    expect(post).not.toHaveBeenCalled();
  });
});
