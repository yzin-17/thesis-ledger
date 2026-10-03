import { describe, expect, it, vi } from 'vitest';
import {
  rebindTushareIdentityContent,
  tushareEventFixture,
  tushareIdentityBundle,
} from './tushare-event-fixtures.js';
import { verifyTushareFundIdentityV3 } from '../../src/market/market-tushare-identity-v3.js';
import { selectMarketEventV3 } from '../../src/market/market-event-selector-v3.js';

function selectionFixture() {
  const exchange = tushareEventFixture();
  const { routeTarget, ...scope } = exchange.request;
  const target = { providerId: routeTarget.providerId, upstreamSource: routeTarget.upstreamSource };
  const read = vi.fn(async () => exchange.response);
  return {
    exchange,
    input: {
      scope,
      read,
      effective: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'synthetic-identity-policy',
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
    },
  };
}

describe('Tushare 原文字节消费校验', () => {
  it('共享 golden 保留中文、末尾换行和实际字节摘要', () => {
    const { response } = tushareEventFixture();
    const evidence = response.tushareIdentityEvidence!;
    expect(evidence.content.endsWith('\n')).toBe(true);
    expect(Buffer.byteLength(evidence.content, 'utf8')).toBe(746);
    expect(evidence.sha256).toBe(
      '6968df31478e972147503480e2e7c8e6438c7e7260e9200f0f27edbf3ef0d840',
    );
    expect(() => verifyTushareFundIdentityV3(response)).not.toThrow();
    expect(response.coverage.complete).toBe(false);
  });

  it.each([' ', '\r\n'])('语义相同的原文尾部变化 %j 仍拒绝', (suffix) => {
    const { response } = tushareEventFixture();
    response.tushareIdentityEvidence!.content += suffix;
    expect(() => verifyTushareFundIdentityV3(response)).toThrow('原文摘要无效');
  });

  it('按 UTF-8 字节限制 1 MiB', () => {
    const { response } = tushareEventFixture();
    const bundle = tushareIdentityBundle(response);
    bundle.mappings[0]!.identityEvidence.documentUrl += `?label=${'中'.repeat(360_000)}`;
    const content = JSON.stringify(bundle);
    rebindTushareIdentityContent(response, content);
    expect(content.length).toBeLessThan(1024 * 1024);
    expect(Buffer.byteLength(content, 'utf8')).toBeGreaterThan(1024 * 1024);
    expect(() => verifyTushareFundIdentityV3(response)).toThrow('原文摘要无效');
  });

  it('其他 Tushare 能力与来源没有该证据时不强制要求', () => {
    const { response } = tushareEventFixture();
    delete response.tushareIdentityEvidence;
    response.routeKey.capability = 'SPLIT_EVENT';
    expect(() => verifyTushareFundIdentityV3(response)).not.toThrow();
    response.routeKey.capability = 'CASH_DISTRIBUTION';
    response.routeTarget.upstreamSource = 'other';
    expect(() => verifyTushareFundIdentityV3(response)).not.toThrow();
  });

  it('其他 route 不能借用 Tushare 身份证据', () => {
    const { response } = tushareEventFixture();
    response.routeKey.capability = 'SPLIT_EVENT';
    expect(() => verifyTushareFundIdentityV3(response)).toThrow('精确来源');
  });

  it('摘要重新绑定后仍复核全部映射范围和独立分红币种', () => {
    const { response } = tushareEventFixture();
    const bundle = tushareIdentityBundle(response);
    bundle.mappings[0]!.scopeDateTo = '2026-01-01';
    rebindTushareIdentityContent(response, JSON.stringify(bundle));
    expect(() => verifyTushareFundIdentityV3(response)).toThrow('准入范围');
    bundle.mappings[0]!.scopeDateTo = '2025-12-31';
    bundle.mappings[0]!.dividendCurrencyEvidence.currency = 'HKD';
    rebindTushareIdentityContent(response, JSON.stringify(bundle));
    expect(() => verifyTushareFundIdentityV3(response)).toThrow('分红币种');
  });
});

describe('Tushare 在线 selector', () => {
  it('保留原文和未证明覆盖，单来源读取一次', async () => {
    const { input, exchange } = selectionFixture();
    expect(await selectMarketEventV3(input)).toEqual({ status: 'observed', ...exchange });
    expect(input.read).toHaveBeenCalledExactlyOnceWith(exchange.request);
  });

  it('原文被篡改后停止，不重试或读取已就绪备用来源', async () => {
    const { input, exchange } = selectionFixture();
    exchange.response.tushareIdentityEvidence!.content += ' ';
    expect(await selectMarketEventV3(input)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_response',
    });
    expect(input.read).toHaveBeenCalledExactlyOnceWith(exchange.request);
  });
});
