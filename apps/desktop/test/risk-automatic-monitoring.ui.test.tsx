// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RiskMonitoringSchedule } from '../src/features/risk/RiskMonitoringSchedule.js';
const monitoring = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ risk: { monitoring } }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const status = {
  acquisitionAvailable: true,
  sources: [
    {
      symbol: '510300.SH',
      assetName: '沪深300ETF',
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
  inputUnavailable: 1,
  inputReason: '必要汇率缺失，组合权重不可评估',
  mode: 'observed-data',
  continuousSource: false,
  eligibleRules: 2,
  futureRules: 1,
  unsupportedRules: 1,
  checkedAt: null,
  evaluatedAt: null,
  gapAt: null,
  missingPrices: 0,
  delayedPrices: 0,
  processorAvailable: true,
  error: null,
  limitation: '当前行情按需获取，没有持续订阅。无法保证关页后盘中及时预警。',
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const openRules = vi.fn();
async function mount(enabledRules: number | null = 3) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RiskMonitoringSchedule enabledRules={enabledRules} onOpenRules={openRules} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  vi.resetAllMocks();
});
describe('风险规则自动接入的桌面状态', () => {
  it('没有启用规则时只显示下一步，不读取行情诊断', async () => {
    await mount(0);
    expect(host.textContent).toBe('自动监控尚未启用规则查看规则');
    expect(monitoring).not.toHaveBeenCalled();
    await act(async () => host.querySelector('button')!.click());
    expect(openRules).toHaveBeenCalledOnce();
  });
  it('多项异常只显示当前最相关的原因', async () => {
    monitoring.mockResolvedValue(status);
    await mount();
    expect(host.textContent).toBe('自动监控必要汇率缺失，组合权重不可评估');
  });
  it('正常监控说明何时评估', async () => {
    monitoring.mockResolvedValue({ ...status, inputUnavailable: 0, unsupportedRules: 0 });
    await mount();
    expect(host.textContent).toBe('自动监控2 条生效规则随行情更新评估');
  });
  it('状态失败不当作未开启，重读恢复不会写入任务或通知设置', async () => {
    monitoring.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(status);
    await mount();
    expect(host.textContent).toContain('监控状态读取失败');
    await act(async () => host.querySelector('button')!.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(host.textContent).toContain('必要汇率缺失');
    expect(monitoring).toHaveBeenCalledTimes(2);
  });
});
