// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { getDesktopApiClient } from '@/shared/api/client';
import { journalAnalyzePeriod } from '@thesis-ledger/domain';
import type { JournalPeriodExplanationRequest } from '@thesis-ledger/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalPeriodReview } from './JournalPeriodReview.js';

type JournalReviews = ReturnType<typeof getDesktopApiClient>['journalReviews'];

const api = vi.hoisted(() => ({
  period:
    vi.fn<
      (
        request: Parameters<JournalReviews['period']>[0],
      ) => Promise<ReturnType<typeof periodResponse>>
    >(),
  savePeriod: vi.fn<(request: Parameters<JournalReviews['savePeriod']>[0]) => Promise<object>>(),
  explainPeriod:
    vi.fn<(request: JournalPeriodExplanationRequest) => Promise<ReturnType<typeof aiRun>>>(),
  periodExplanation: vi.fn<(id: string) => Promise<ReturnType<typeof aiRun>>>(),
}));
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToastManager: () => toast }));
vi.mock('@/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));

const accountId = '00000000-0000-4000-8000-000000000001';
const periodResponse = (request: { start: string; end: string }) => ({
  accountId,
  mode: 'shadow',
  symbol: null,
  ledgerRevision: '12',
  projectionGeneration: '7',
  candidates: [],
  result: journalAnalyzePeriod([], request),
});
const aiRun = (request: JournalPeriodExplanationRequest) => ({
  id: '00000000-0000-4000-8000-000000000061',
  accountId: request.accountId,
  mode: request.mode,
  symbol: request.symbol ?? null,
  start: request.start,
  end: request.end,
  ledgerRevision: request.expectedLedgerRevision,
  projectionGeneration: request.expectedProjectionGeneration,
  algorithmVersion: request.expectedAlgorithmVersion,
  objectFingerprints: request.objectFingerprints,
  provider: 'fixture',
  model: 'fixture-model',
  promptVersion: 'fixture-v1',
  status: 'succeeded',
  errorCode: null,
  errorSummary: null,
  createdAt: '2026-11-14T00:00:00Z',
  result: {
    version: 1,
    provider: 'fixture',
    createdAt: '2026-11-14T00:00:00Z',
    conclusion: '本次周期 AI 解读结果',
    evidence: [],
    risks: [],
    unknowns: [],
    disclaimer: '仅供复盘参考',
    signals: [],
  },
});
const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
const interact = async (action: () => void) =>
  act(async () => {
    action();
    await Promise.resolve();
  });
const wait = async (check: () => void) =>
  vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    check();
  });

describe('周期复盘当前解读与快照保存', () => {
  let root: Root;
  let host: HTMLDivElement;
  let client: QueryClient;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    notifyManager.setNotifyFunction((callback) => {
      act(callback);
    });
    for (const method of Object.values(api)) method.mockReset();
    toast.add.mockReset();
    api.period.mockImplementation((request) => Promise.resolve(periodResponse(request)));
    api.savePeriod.mockResolvedValue({});
    client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    client.clear();
    notifyManager.setNotifyFunction((callback) => callback());
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = async () =>
    interact(() => {
      root.render(
        <QueryClientProvider client={client}>
          <JournalPeriodReview accountId={accountId} mode="shadow" onSelect={vi.fn()} />
        </QueryClientProvider>,
      );
    });

  const analyze = async () => {
    await interact(() => button(host, '分析周期')!.click());
    await wait(() => expect(button(host, 'AI 解读')?.disabled).toBe(false));
  };

  it('未分析时展示空状态，AI 解读与保存快照都不可点击', async () => {
    await render();
    expect(host.textContent).toContain('暂无周期分析结果');
    expect(button(host, 'AI 解读')?.disabled).toBe(true);
    expect(button(host, '保存复盘快照')?.disabled).toBe(true);
    expect(api.period).not.toHaveBeenCalled();
  });

  it('完成分析后只保存确定性结果，不自动绑定历史解读任务', async () => {
    await render();
    await analyze();
    expect(host.querySelector('table[aria-label="两种统计粒度对照"] thead')?.textContent).toBe(
      '指标完整交易周期单次减仓',
    );
    expect(host.textContent).toContain('两种粒度均无合格样本');
    expect(host.textContent).not.toContain('暂无周期分析结果');
    expect(button(host, '保存复盘快照')?.disabled).toBe(false);
    await interact(() => button(host, '保存复盘快照')!.click());
    await wait(() => expect(api.savePeriod).toHaveBeenCalledOnce());
    expect(api.savePeriod.mock.calls[0]![0]).toMatchObject({
      accountId,
      mode: 'shadow',
      expectedLedgerRevision: '12',
      expectedProjectionGeneration: '7',
      objectFingerprints: {},
    });
    expect(api.savePeriod.mock.calls[0]![0]).not.toHaveProperty('aiRunId');
    await wait(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: '周期复盘快照已保存', type: 'success' }),
      ),
    );
  });

  it('AI 解读直接在外层页面展示，重新分析后清空旧结果', async () => {
    api.explainPeriod.mockImplementation((request) => Promise.resolve(aiRun(request)));
    api.periodExplanation.mockImplementation(() =>
      Promise.resolve(aiRun(api.explainPeriod.mock.calls[0]![0])),
    );
    await render();
    expect(host.querySelector('[aria-label="本次周期 AI 解读"]')).toBeNull();
    await analyze();
    expect(host.querySelector('[aria-label="本次周期 AI 解读"]')).not.toBeNull();
    expect(host.textContent).toContain('尚未生成 AI 解读');

    await interact(() => button(host, 'AI 解读')!.click());
    await wait(() => expect(host.textContent).toContain('本次周期 AI 解读结果'));
    expect(api.explainPeriod).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    await interact(() => button(host, '分析周期')!.click());
    await wait(() => expect(host.textContent).not.toContain('本次周期 AI 解读结果'));
    expect(host.textContent).toContain('尚未生成 AI 解读');
  });

  it('只展示当前 AI 解读，保存成功解读的 run；重新分析后不沿用旧 run', async () => {
    const runId = '00000000-0000-4000-8000-000000000002';
    const explanation = {
      version: 1,
      provider: 'fixture',
      conclusion: '当前分析的中文解读',
      evidence: [],
      risks: [],
      unknowns: [],
      disclaimer: '仅供研究',
      signals: [],
      createdAt: '2026-01-05T10:00:00Z',
    };
    api.explainPeriod.mockImplementation((request) =>
      Promise.resolve({
        id: runId,
        accountId,
        mode: 'shadow',
        symbol: null,
        start: request.start,
        end: request.end,
        ledgerRevision: request.expectedLedgerRevision,
        projectionGeneration: request.expectedProjectionGeneration,
        algorithmVersion: request.expectedAlgorithmVersion,
        objectFingerprints: request.objectFingerprints,
        provider: 'fixture',
        model: 'fixture-model',
        promptVersion: 'v1',
        status: 'succeeded',
        errorCode: null,
        errorSummary: null,
        result: explanation,
        createdAt: '2026-01-05T10:00:00Z',
      }),
    );
    api.periodExplanation.mockImplementation(() => {
      const result = api.explainPeriod.mock.results[0]!;
      if (result.type === 'return') return result.value;
      throw new Error('受控生成结果未返回');
    });
    await render();
    await analyze();
    await interact(() => button(host, 'AI 解读')!.click());
    await wait(() => expect(api.explainPeriod).toHaveBeenCalledOnce());
    await wait(() => expect(host.textContent).toContain('当前分析的中文解读'));
    expect(host.textContent).not.toContain('历史任务');
    expect(host.textContent).not.toContain('移除任务引用');
    await wait(() => expect(button(host, '保存复盘快照')?.disabled).toBe(false));
    await interact(() => button(host, '保存复盘快照')!.click());
    await wait(() => expect(api.savePeriod).toHaveBeenCalledOnce());
    expect(api.savePeriod.mock.calls[0]![0].aiRunId).toBe(runId);

    await interact(() => button(host, '分析周期')!.click());
    await wait(() => expect(api.period).toHaveBeenCalledTimes(2));
    await wait(() => expect(button(host, '保存复盘快照')?.disabled).toBe(false));
    expect(host.textContent).not.toContain('当前分析的中文解读');
    api.savePeriod.mockClear();
    await interact(() => button(host, '保存复盘快照')!.click());
    await wait(() => expect(api.savePeriod).toHaveBeenCalledOnce());
    expect(api.savePeriod.mock.calls[0]![0]).not.toHaveProperty('aiRunId');
  });

  it('分析失败时不开放 AI 解读与保存', async () => {
    api.period.mockRejectedValue(new Error('受控分析失败'));
    await render();
    await interact(() => button(host, '分析周期')!.click());
    await wait(() => expect(host.textContent).toContain('周期分析未完成'));
    expect(button(host, 'AI 解读')?.disabled).toBe(true);
    expect(button(host, '保存复盘快照')?.disabled).toBe(true);
    expect(api.savePeriod).not.toHaveBeenCalled();
  });
});
