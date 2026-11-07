// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount, setApi } from './mobile-view-harness';
import { RiskMonitoringSchedule } from '../../src/features/risk-rules/RiskMonitoringSchedule';

describe('移动风险规则自动监控状态', () => {
  it('两端消费相同状态契约，不再要求用户另开收盘扫描', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        mode: 'observed-data',
        continuousSource: false,
        acquisitionAvailable: true,
        sources: [
          {
            symbol: '510300.SH',
            assetName: '沪深300ETF',
            assetType: 'ETF',
            provider: 'tencent',
            minIntervalSeconds: 600,
            sourceUpdateIntervalSeconds: null,
            acquisition: 'public-snapshot',
            reason: 'source_request_window',
            sourceTime: '2026-11-06T02:00:00Z',
            fetchedAt: '2026-11-06T02:00:01Z',
            nextAttemptAt: '2026-11-06T02:10:00Z',
          },
        ],
        eligibleRules: 1,
        futureRules: 1,
        unsupportedRules: 1,
        checkedAt: null,
        evaluatedAt: null,
        gapAt: null,
        missingPrices: 0,
        delayedPrices: 0,
        processorAvailable: true,
        error: null,
        limitation: '当前行情按需获取，没有持续订阅，无法保证盘中及时预警。',
      }),
    );
    setApi(fetcher);
    await mount(<RiskMonitoringSchedule enabledRules={2} />);
    expect(document.body.textContent).toContain('生效后自动参与，无需另开扫描');
    expect(document.body.textContent).toContain('没有持续订阅');
    expect(document.body.textContent).toContain('沪深300ETF（510300.SH）');
    expect(document.body.textContent).toContain('最短请求间隔 600 秒，上游更新频率未知');
    expect(document.body.textContent).not.toContain('16:05');
    expect(
      fetcher.mock.calls.every(
        ([url, init]) =>
          String(url).includes('/risk/monitoring') && (!init?.method || init.method === 'GET'),
      ),
    ).toBe(true);
  });
});
