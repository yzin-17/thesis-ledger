// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '../src/components/ui/toast.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BacktestSetupDialog } from '../src/features/strategy/BacktestSetupDialog.js';
import { useBacktestExecutionModel } from '../src/features/strategy/use-backtest-execution-model.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import type * as ApiClient from '@thesis-ledger/api-client';

const api = vi.hoisted(() => ({ resolve: vi.fn(), submit: vi.fn() }));
vi.mock('@thesis-ledger/api-client', async (original) => {
  const actual = await original<typeof ApiClient>();
  return {
    ...actual,
    backtestClients: (...args: Parameters<typeof actual.backtestClients>) => ({
      ...actual.backtestClients(...args),
      resolveExecutionModel: api.resolve,
    }),
  };
});
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ strategySubmissions: { submit: api.submit } }),
}));
vi.mock('../src/features/strategy-authoring/AuthoringRunIntents.js', () => ({
  AuthoringRunIntents: () => null,
}));

const model = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json', 'utf8'),
);
const schema = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/backtest-v2.exchange.json', 'utf8'),
);
const version = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  schema,
  createdAt: '2026-11-07T00:00:00Z',
};
const strategy = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '已保存策略',
  status: 'active',
  updatedAt: '2026-11-07T00:00:00Z',
  versions: [version],
};
let root: Root, client: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const flush = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 15));
  });
async function render(node: ReactNode) {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider
          router={createMemoryRouter([
            {
              path: '*',
              element: (
                <ToastProvider>
                  <ConfirmDialogProvider>
                    <NavigationGuardProvider>{node}</NavigationGuardProvider>
                  </ConfirmDialogProvider>
                </ToastProvider>
              ),
            },
          ])}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (el) => el.textContent?.trim() === label,
  )!;
const dialog = (onOpenChange = vi.fn(), executionModel?: typeof model, onSubmitted = vi.fn()) => (
  <BacktestSetupDialog
    open
    busy={false}
    strategy={strategy}
    version={version}
    initialSetup={{
      period: { start: '2024-01-02', end: '2024-03-29' },
      initialCash: 100000,
      ...(executionModel ? { executionModel } : {}),
    }}
    onOpenChange={onOpenChange}
    onSubmit={vi.fn(async () => true)}
    onSubmitted={onSubmitted}
  />
);

beforeEach(() => {
  vi.resetAllMocks();
  api.resolve.mockResolvedValue({ status: 'available', policy: 'research-defaults', notes: ['不模拟涨跌停；停牌、退市和行情仍核验。', '未配置税费暂不计入。'], model });
  api.submit.mockResolvedValue({ id: 'submission', state: 'queued' });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined as never;
  client?.clear();
  document.body.innerHTML = '';
});

describe('已保存策略的普通回测入口', () => {
  it('自动读取设置，无需 JSON 或额外确认即可提交原有准备和运行链', async () => {
    const onOpenChange = vi.fn();
    const onSubmitted = vi.fn();
    await render(dialog(onOpenChange, undefined, onSubmitted));
    expect(document.querySelector('textarea[aria-label="执行模型配置"]')).toBeNull();
    expect(document.body.textContent).toContain('费用与成交方式沿用当前策略');
    expect(document.body.textContent).toContain('研究默认规则');
    expect(document.body.textContent).toContain('未配置税费暂不计入');
    expect(button('开始回测').disabled).toBe(false);
    expect(api.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyVersionId: version.id,
        startDate: '2024-01-02',
        adjustment: 'none',
      }),
      expect.any(AbortSignal),
    );
    await act(async () => button('开始回测').click());
    await flush();
    expect(api.submit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        kind: 'ordinary',
        preparation: expect.objectContaining({
          strategyVersionId: version.id,
          runConfig: expect.objectContaining({ executionModel: model }),
        }),
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it('提交失败时保留弹窗并显示错误，不通知跳转', async () => {
    const onOpenChange = vi.fn();
    const onSubmitted = vi.fn();
    api.submit.mockRejectedValue(new Error('回测提交失败，请重试。'));
    await render(dialog(onOpenChange, undefined, onSubmitted));
    await act(async () => button('开始回测').click());
    await flush();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('回测提交失败，请重试。');
  });

  it('资料不足展示业务原因，重试成功后允许开始', async () => {
    api.resolve.mockResolvedValueOnce({
      status: 'blocked',
      reasonCode: 'rules-unavailable',
      message: '所选日期缺少交易规则，请更新数据后重试。',
    });
    await render(dialog());
    expect(button('开始回测').disabled).toBe(true);
    expect(document.body.textContent).toContain('所选日期缺少交易规则');
    await act(async () => button('重新准备执行设置').click());
    await flush();
    expect(button('开始回测').disabled).toBe(false);
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('再次运行沿用原冻结设置，无需重新读取市场规则', async () => {
    await render(dialog(vi.fn(), model));
    expect(api.resolve).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('沿用本次记录的回测执行设置');
    expect(button('开始回测').disabled).toBe(false);
  });

  it('日期切换后，迟到配置不会替代当前日期的结果', async () => {
    const old = deferred<{ status: string; model: typeof model }>();
    api.resolve
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ status: 'available', model: { ...model, id: 'new-window' } });
    function Harness({ end }: { end: string }) {
      const result = useBacktestExecutionModel({
        strategyVersionId: version.id,
        period: { start: '2024-01-02', end },
        currency: 'CNY',
        adjustment: 'none',
      });
      return <p>{result.model?.id ?? 'loading'}</p>;
    }
    await render(<Harness end="2024-03-29" />);
    await render(<Harness end="2024-03-28" />);
    expect(document.body.textContent).toContain('new-window');
    await act(async () => old.resolve({ status: 'available', model }));
    await flush();
    expect(document.body.textContent).toContain('new-window');
    expect(document.body.textContent).not.toContain(model.id);
  });
});
