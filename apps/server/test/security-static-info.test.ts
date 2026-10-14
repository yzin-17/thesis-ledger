import { describe, expect, it, vi } from 'vitest';
import { readSecurityStaticInfo } from '../src/integration/dsa/dsa-security-static-info.js';
import { MarketSecurityStaticInfoController } from '../src/market/market-security-static-info.controller.js';
import type { DsaClient } from '../src/integration/dsa/dsa.client.js';

const response = (requestId: string) => ({
  contractVersion: 3, consumer: 'thesis-ledger', requestId, symbol: 'SPY.US', assetType: 'ETF',
  market: 'US', name: 'SPDR S&P 500 ETF', securityId: '9007199254740993', sharesPerLot: '1', listingDate: null,
  delisted: false, exchange: null, provider: 'futu', historicalChanges: 'unverified',
  observedAt: '2026-10-09T01:00:00Z', fetchedAt: '2026-10-09T01:01:00Z', policyRevision: 1,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
});

describe('当前证券资料独立消费', () => {
  it('拒绝额外历史查询参数', () => {
    const post = vi.fn();
    const controller = new MarketSecurityStaticInfoController({ post } as unknown as DsaClient);
    expect(() => controller.read('SPY.US', 'ETF', { symbol: 'SPY.US', assetType: 'ETF', asOf: '2020-01-01' }))
      .toThrow('不接受历史');
    expect(post).not.toHaveBeenCalled();
  });
  it('绑定证券、类型与请求，保留精确 ID、观察时间和来源', async () => {
    const post = vi.fn(async (_path, request) => response(request.requestId));
    const result = await readSecurityStaticInfo({ post } as unknown as DsaClient, 'SPY.US', 'ETF');
    expect(post.mock.calls[0]).toEqual(['/api/v3/thesis-ledger/market/security-static-info', {
      contractVersion: 3, consumer: 'thesis-ledger', requestId: result.requestId, symbol: 'SPY.US', assetType: 'ETF',
    }, 1]);
    expect(result.securityId).toBe('9007199254740993');
  });
  it.each([{ symbol: 'AAPL.US' }, { assetType: 'STOCK' }, { requestId: 'other' }, { market: 'HK' }])(
    '拒绝响应错配 %j', async change => {
      const post = vi.fn(async (_path, request) => ({ ...response(request.requestId), ...change }));
      await expect(readSecurityStaticInfo({ post } as unknown as DsaClient, 'SPY.US', 'ETF'))
        .rejects.toMatchObject({ code: 'invalid-response' });
    },
  );
  it.each([['600519.SH', 'STOCK'], ['SPY.US', undefined], ['SPY.US', 'OPTION'], [undefined, 'STOCK']])(
    '无效请求不访问 DSA %s %s', (symbol, assetType) => {
      const post = vi.fn();
      const controller = new MarketSecurityStaticInfoController({ post } as unknown as DsaClient);
      expect(() => controller.read(symbol, assetType)).toThrow('港美证券代码');
      expect(post).not.toHaveBeenCalled();
    },
  );
});
