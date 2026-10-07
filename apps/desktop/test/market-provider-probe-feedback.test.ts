import { describe, expect, it } from 'vitest';
import type { MarketProviderTestResponse } from '@thesis-ledger/schemas';
import { marketProviderProbeFeedback } from '../src/features/market-data/market-provider-probe-feedback.js';

const probe = (
  capabilityResults: MarketProviderTestResponse['capabilityResults'],
): MarketProviderTestResponse => ({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  providerId: 'tushare',
  requestId: 'probe-1',
  status: 'healthy',
  credentialConfigured: true,
  capabilityResults,
});

describe('当前 Provider 测试反馈', () => {
  it('只有实际执行的健康能力显示通过', () => {
    expect(
      marketProviderProbeFeedback(
        probe({ DAILY_BAR: { status: 'healthy', readOnly: true, attempted: true } }),
        'Tushare',
      ).type,
    ).toBe('success');
    for (const result of [
      probe({}),
      probe({ DAILY_BAR: { status: 'healthy', readOnly: true, attempted: false } }),
      probe({
        DAILY_BAR: {
          status: 'healthy',
          readOnly: true,
          attempted: true,
          errorCode: 'fixture_mode',
        },
      }),
    ])
      expect(marketProviderProbeFeedback(result, 'Tushare').type).toBe('error');
  });

  it('未配置结果使用同一中文能力标签', () => {
    const result = probe({
      DAILY_BAR: {
        status: 'unconfigured',
        readOnly: true,
        attempted: false,
        errorCode: 'not_configured',
      },
    });
    result.status = 'unconfigured';
    expect(marketProviderProbeFeedback(result, 'Tushare').text).toBe('日线行情：尚未配置凭据');
  });
});
