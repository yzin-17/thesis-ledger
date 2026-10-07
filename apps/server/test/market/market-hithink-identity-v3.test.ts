import { describe, expect, it, vi } from 'vitest';
import { verifyHithinkFundIdentityV3 } from '../../src/market/market-hithink-identity-v3.js';
import { selectMarketEventV3 } from '../../src/market/market-event-selector-v3.js';
import { hithinkEventFixture, rebindHithinkIdentityContent } from './hithink-event-fixtures.js';

describe('HiThink 分红在线与离线原字节校验', () => {
  it('合成证据原字节与独立币种通过，覆盖仍未证明完整', () => {
    const { response } = hithinkEventFixture();
    expect(() => verifyHithinkFundIdentityV3(response)).not.toThrow();
    expect(response.coverage.complete).toBe(false);
    expect(response.facts[0]!.currency).toBe('CNY');
  });

  it.each([' ', '\r\n'])('原文尾部变化 %j 被字节摘要拒绝', (suffix) => {
    const { response } = hithinkEventFixture();
    response.hithinkIdentityEvidence!.content += suffix;
    expect(() => verifyHithinkFundIdentityV3(response)).toThrow('原文摘要无效');
  });

  it('重绑摘要也不能越过身份范围或币种检查', () => {
    const { response } = hithinkEventFixture();
    const bundle = JSON.parse(response.hithinkIdentityEvidence!.content);
    bundle.mappings[0].scopeDateTo = '2025-02-28';
    rebindHithinkIdentityContent(response, JSON.stringify(bundle));
    expect(() => verifyHithinkFundIdentityV3(response)).toThrow('身份');
    bundle.mappings[0].scopeDateTo = '2025-12-31';
    bundle.mappings[0].dividendCurrencyEvidence.currency = 'HKD';
    rebindHithinkIdentityContent(response, JSON.stringify(bundle));
    expect(() => verifyHithinkFundIdentityV3(response)).toThrow('币种');
  });

  it('在线选择遇原文篡改停止，不转向已就绪备用来源', async () => {
    const { request, response } = hithinkEventFixture();
    const { routeTarget, ...scope } = request;
    response.hithinkIdentityEvidence!.content += ' ';
    const read = vi.fn(async () => response);
    const target = {
      providerId: routeTarget.providerId,
      upstreamSource: routeTarget.upstreamSource,
    };
    const result = await selectMarketEventV3({
      scope,
      read,
      effective: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'synthetic-hithink-policy',
        revision: 1,
        sourceDesiredRevision: 1,
        enabled: true,
        appliedAt: '2026-09-28T11:00:00Z',
        routes: [
          {
            key: scope.routeKey,
            reason: null,
            targets: [
              { ...routeTarget, eligible: true, reason: null },
              {
                providerId: 'fallback',
                upstreamSource: 'fallback',
                routeIndex: 1,
                eligible: true,
                reason: null,
              },
            ],
          },
        ],
      },
      catalog: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        catalogRevision: 1,
        generatedAt: '2026-09-28T11:00:00Z',
        integrity: 'complete',
        entries: [
          { key: scope.routeKey, target, state: 'ready' },
          {
            key: scope.routeKey,
            target: { providerId: 'fallback', upstreamSource: 'fallback' },
            state: 'ready',
          },
        ],
      },
    });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
    expect(read).toHaveBeenCalledExactlyOnceWith(request);
  });
});
