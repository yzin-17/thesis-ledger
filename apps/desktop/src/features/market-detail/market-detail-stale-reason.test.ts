import { describe, expect, it } from 'vitest';
import type { MarketDisplayDetailSection } from '@thesis-ledger/api-client';
import { marketDetailStaleReason } from './market-detail-stale-reason.js';

const history = (
  status: 'ready' | 'stale',
  code?: 'timeout' | 'rate_limited',
): Extract<MarketDisplayDetailSection, { capability: 'fund-nav-history' }> => ({
  capability: 'fund-nav-history',
  status,
  data: [
    {
      version: 3,
      symbol: '000001.OF',
      unitNav: 0.895,
      navDate: '2026-11-03T00:00:00Z',
      fetchedAt: '2026-11-04T00:00:00Z',
      provider: 'akshare',
      freshness: status === 'stale' ? 'stale' : 'delayed',
      ...(code
        ? {
            staleReason: {
              code,
              message:
                code === 'timeout'
                  ? '数据源请求超时，当前展示上次成功取得的数据。'
                  : '数据源限制了请求频率，当前展示上次成功取得的数据。',
            },
          }
        : {}),
    },
  ],
});

describe('行情详情陈旧原因展示', () => {
  it('保留服务端超时与限流原因', () => {
    expect(marketDetailStaleReason(history('stale', 'timeout'))).toContain('请求超时');
    expect(marketDetailStaleReason(history('stale', 'rate_limited'))).toContain('请求频率');
  });
  it('正常上一交易日净值不误报陈旧，没有原因时明确未知', () => {
    expect(marketDetailStaleReason(history('ready'))).toBeNull();
    expect(marketDetailStaleReason(history('stale'))).toContain('来源未返回具体陈旧原因');
  });
  it('同一序列重复根因只显示一次，优先显示分段诊断', () => {
    const section = history('stale', 'timeout');
    const repeated = {
      ...section,
      data: [...(section.data ?? []), ...(section.data ?? [])],
    };
    expect(marketDetailStaleReason(repeated)?.match(/请求超时/g)).toHaveLength(1);
    expect(
      marketDetailStaleReason({
        ...section,
        error: {
          code: 'permission_denied',
          message: '当前账户没有净值历史权限',
          diagnosticId: 'd1',
        },
      }),
    ).toBe('当前账户没有净值历史权限');
  });
});
