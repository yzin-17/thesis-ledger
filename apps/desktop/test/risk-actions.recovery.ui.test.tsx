// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import { RiskCenter } from '../src/features/risk/RiskCenter.js';
import type { RiskRuleRecord } from '../src/features/risk/risk.types.js';
import * as api from '../src/features/risk/risk.api.js';

const toast = vi.hoisted(() => ({ add: vi.fn(() => 'risk-error-toast'), close: vi.fn() }));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => toast }));
vi.mock('../src/features/risk/risk.api.js', () => ({
  fetchRiskRules: vi.fn(),
  fetchRiskEvents: vi.fn(),
  fetchRiskNotifications: vi.fn(),
  fetchNotificationRouting: vi.fn(),
  fetchRiskAudit: vi.fn(),
  createRiskRule: vi.fn(),
  patchRiskRule: vi.fn(),
  deleteRiskRule: vi.fn(),
  restoreRiskRule: vi.fn(),
  testRiskRule: vi.fn(),
  scanRisk: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });
const rule: RiskRuleRecord = {
  id: 'rule-recovery',
  version: 1,
  kind: 'price-above',
  scope: 'security',
  severity: 'warning',
  threshold: 9,
  enabled: false,
  needsRepair: false,
  repairReason: null,
  archivedAt: null,
  assetName: '受控规则标的',
  symbol: '510300.SH',
  accountId: 'account-recovery',
  effectiveAt: '2026-10-01T00:00:00Z',
};
let root: Root;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
const NativeRequest = globalThis.Request;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) =>
    element.textContent?.trim().startsWith(text),
  )!;
async function click(text: string) {
  await act(async () => button(text).click());
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function mount(tab = 'rules') {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <QueryClientProvider client={client}>
            <ConfirmDialogProvider>
              <NavigationGuardProvider>
                <RiskCenter accounts={[]} portfolio={null} portfolioState="ready" mode="shadow" />
              </NavigationGuardProvider>
            </ConfirmDialogProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: [`/risk-center?tab=${tab}`] },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
  await flush();
}
beforeEach(() => {
  vi.resetAllMocks();
  toast.add.mockReturnValue('risk-error-toast');
  // Router 的 jsdom AbortSignal 与 Node Request 来自不同 realm；API 已全部替代。
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        const options = { ...init };
        delete options.signal;
        super(input, options);
      }
    },
  );
  vi.mocked(api.fetchRiskRules).mockResolvedValue([rule]);
  vi.mocked(api.fetchRiskEvents).mockResolvedValue([]);
  vi.mocked(api.fetchRiskNotifications).mockResolvedValue([]);
  vi.mocked(api.fetchNotificationRouting).mockResolvedValue({ routes: [] });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  router?.dispose();
  client?.clear();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('风险管理未过的异常与确认读取', () => {
  it.each(['events', 'notifications'])(
    '%s 自身失败不借用其他查询的空态，只重读本表',
    async (tab) => {
      const request =
        tab === 'events' ? vi.mocked(api.fetchRiskEvents) : vi.mocked(api.fetchRiskNotifications);
      const title = tab === 'events' ? '风险事件' : '通知状态';
      const subject = tab === 'events' ? '风险事件' : '通知记录';
      request.mockRejectedValueOnce(new Error('受控独立读取失败')).mockResolvedValue([]);
      await mount(tab);
      const panel = () =>
        [...document.querySelectorAll<HTMLElement>('section.panel')].find(
          (element) => element.querySelector('h2')?.textContent === title,
        )!;
      expect(panel().textContent).toContain(`${subject}读取失败`);
      expect(panel().textContent).not.toContain('暂无');
      await act(async () => panel().querySelector<HTMLButtonElement>('button')!.click());
      await flush();
      expect(panel().textContent).toContain('暂无');
      expect(panel().textContent).not.toContain('读取失败');
      expect(request).toHaveBeenCalledTimes(2);
      expect(api.scanRisk).not.toHaveBeenCalled();
    },
  );

  it('启停确认响应保留标的名，读取失败锁住写入口，只读恢复不再 PATCH', async () => {
    const next = { ...rule, version: 2, enabled: true };
    const response = { ...next };
    delete response.assetName;
    const read = deferred<RiskRuleRecord[]>();
    vi.mocked(api.patchRiskRule).mockResolvedValue(response);
    vi.mocked(api.fetchRiskRules)
      .mockResolvedValueOnce([rule])
      .mockReturnValueOnce(read.promise)
      .mockResolvedValue([next]);
    await mount();
    await act(async () => {
      button('启用规则').click();
      button('启用规则').click();
    });
    expect(button('更新中…').disabled).toBe(true);
    await act(async () => read.reject(new Error('受控规则读取失败')));
    await flush();
    expect(document.body.textContent).toContain('规则更改已保存');
    expect(document.body.textContent).toContain('无需再次提交');
    expect(document.body.textContent).toContain('受控规则标的');
    expect(button('停用规则').disabled).toBe(true);
    await click('重新读取规则');
    await flush();
    expect(button('停用规则').disabled).toBe(false);
    expect(api.patchRiskRule).toHaveBeenCalledTimes(1);
  });

  it('归档在途不关闭，失败可重试；恢复后列表失败不会再次写入', async () => {
    const write = deferred<RiskRuleRecord>();
    const archived = { ...rule, version: 2, archivedAt: '2026-10-18T00:00:00Z' };
    const restored = { ...rule, version: 3 };
    vi.mocked(api.deleteRiskRule).mockReturnValueOnce(write.promise).mockResolvedValue(archived);
    vi.mocked(api.restoreRiskRule).mockResolvedValue(restored);
    await mount();
    await click('归档规则');
    await click('确认归档');
    expect(button('取消').disabled).toBe(true);
    await act(async () => write.reject(new Error('受控归档失败')));
    expect(document.body.textContent).toContain('归档风险规则？');
    vi.mocked(api.fetchRiskRules).mockResolvedValue([archived]);
    await click('确认归档');
    await flush();
    await click('显示已归档');
    vi.mocked(api.fetchRiskRules)
      .mockRejectedValueOnce(new Error('受控恢复后读取失败'))
      .mockResolvedValue([restored]);
    await click('恢复规则');
    await flush();
    expect(document.body.textContent).toContain('规则更改已保存');
    expect(button('启用规则').disabled).toBe(true);
    await click('重新读取规则');
    await flush();
    expect(button('启用规则').disabled).toBe(false);
    expect(api.deleteRiskRule).toHaveBeenCalledTimes(2);
    expect(api.restoreRiskRule).toHaveBeenCalledTimes(1);
  });

  it('审计初次失败保留弹窗，重试为空而非失败，关闭后可再打开', async () => {
    vi.mocked(api.fetchRiskAudit)
      .mockRejectedValueOnce(new Error('受控审计失败'))
      .mockResolvedValue([]);
    await mount();
    await click('查看审计');
    await flush();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain('审计记录读取失败');
    await click('重新读取审计');
    await flush();
    expect(document.body.textContent).not.toContain('审计记录读取失败');
    expect(api.fetchRiskAudit).toHaveBeenCalledTimes(2);
    await click('关闭');
    expect(api.testRiskRule).not.toHaveBeenCalled();
  });

  it('人工测试和扫描失败反馈不变成成功，重试不发送通知', async () => {
    vi.mocked(api.testRiskRule)
      .mockRejectedValueOnce(new Error('受控测试失败'))
      .mockResolvedValue([]);
    vi.mocked(api.scanRisk)
      .mockRejectedValueOnce(new Error('受控扫描失败'))
      .mockResolvedValue({ scanId: 'scan-controlled', results: [] });
    await mount();
    await click('人工测试');
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: '人工测试失败' }));
    await click('人工测试');
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: '人工测试完成' }));
    expect(toast.close).toHaveBeenCalledWith('risk-error-toast');
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    await act(async () => tabs.find((element) => element.textContent === '总览')!.click());
    await click('立即执行风险规则');
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: '风险扫描失败' }));
    vi.mocked(api.fetchRiskEvents)
      .mockRejectedValueOnce(new Error('受控扫描后读取失败'))
      .mockResolvedValue([]);
    await click('立即执行风险规则');
    await flush();
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '风险扫描已完成',
        description: expect.stringContaining('没有通知需要发送'),
      }),
    );
    expect(document.body.textContent).toContain('无需再次执行');
    expect(button('立即执行风险规则').disabled).toBe(true);
    await click('重新读取风险历史');
    await flush();
    expect(button('立即执行风险规则').disabled).toBe(false);
    expect(api.scanRisk).toHaveBeenCalledTimes(2);
  });
});
