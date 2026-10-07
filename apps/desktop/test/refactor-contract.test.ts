import { describe, expect, it, vi } from 'vitest';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import { fetchRiskAudit, fetchRiskEvents } from '../src/features/risk/risk.api.js';
import { riskAuditQueryOptions, riskKeys } from '../src/features/risk/risk.queries.js';
import {
  fetchAutomationHistory,
  fetchProviderHealthHistory,
} from '../src/features/providers/providers.api.js';
import { providerKeys } from '../src/features/providers/providers.queries.js';
import {
  fetchPerformanceHistory,
  fetchPerformanceTargets,
} from '../src/features/performance/performance.api.js';
import { performanceKeys } from '../src/features/performance/performance.queries.js';
import { fetchImportDrafts, uploadScreenshotImport } from '../src/features/import/import.api.js';
import { importKeys } from '../src/features/import/import.queries.js';
import { createAiRun, fetchAiRuns } from '../src/features/ai/ai.api.js';
import { resolveAiRunsLoadState } from '../src/features/ai/ai.queries.js';
import { createJournalReviewActions } from '../src/features/journal/journal.actions.js';
import { reviewBehavior, reviewSingleTrade } from '../src/features/journal/journal.api.js';
import type {
  BehaviorReviewResult,
  JournalReviewResult,
  ReviewTrade,
} from '../src/features/journal/journal.types.js';
import {
  cancelBacktest,
  createStrategy,
  createStrategyVersion,
  fetchBacktestJob,
  fetchBacktestJobs,
  runBacktest,
} from '../src/features/strategy/strategy.api.js';
import { createStrategyActionHandlers } from '../src/features/strategy/strategy.actions.js';
import { jobFallbackInterval, shouldPollJobs } from '../src/features/strategy/strategy.queries.js';
import {
  applyBacktestJobSummaryEvent,
  createBacktestEventConnection,
} from '../src/features/strategy/strategy.events.js';
import type { BacktestJobSummary } from '../src/features/strategy/strategy.types.js';
import {
  fetchPortfolioValuation,
  saveCashBalance,
  searchPortfolioInstruments,
} from '../src/features/portfolio/portfolio.api.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';
import { resolveLoadState } from '../src/features/shared/loadState.js';

const makeClient = (response: unknown) => {
  const request = vi.fn(async <T>(path: string, init?: RequestInit) => {
    void path;
    void init;
    return response as T;
  });
  return { client: { request } as unknown as DesktopRequestClient, request };
};

const reviewTradeFixture: ReviewTrade = {
  symbol: '600519.SH',
  entryAt: '2026-01-02T09:30:00.000Z',
  exitAt: '2026-01-06T09:30:00.000Z',
  pnl: -120,
  plannedStop: 1400,
  actualExit: 1388,
};

const makeJournalClient = () => {
  const request = vi.fn(async <T>(path: string) => {
    if (path === '/journal/analysis/planned-vs-actual') return { deviation: -12 } as T;
    if (path === '/journal/analysis/behavior') return { discipline: 'needs-review' } as T;
    if (path === '/journal/analysis/counterfactual') return { avoidedLoss: 120 } as T;
    if (path === '/journal/analysis/review') return { windowDays: 4 } as T;
    return {
      id: 'run-journal-1',
      provider: 'mock',
      model: 'behavior-review-default',
      promptVersion: 'journal-review-v1',
    } as T;
  });
  return { client: { request } as unknown as DesktopRequestClient, request };
};

describe('拆分后的领域请求契约', () => {
  it('Risk 审计 Query 按 ruleId 请求并在缺少 ruleId 时保持禁用', async () => {
    const { client, request } = makeClient([]);
    await fetchRiskAudit('rule/1', client);
    expect(request).toHaveBeenCalledWith('/risk/rules/rule%2F1/audit', expect.anything());

    const options = riskAuditQueryOptions('rule-1', client);
    expect(options.enabled).toBe(true);
    await options.queryFn();
    expect(request).toHaveBeenLastCalledWith('/risk/rules/rule-1/audit', expect.anything());
    expect(riskAuditQueryOptions(null).enabled).toBe(false);
  });

  it('Risk query key 和 mode 请求参数保持隔离', async () => {
    const { client, request } = makeClient([]);
    await fetchRiskEvents('shadow', client);

    expect(request).toHaveBeenCalledWith('/risk/events?mode=shadow', expect.anything());
    expect(riskKeys.events('actual')).not.toEqual(riskKeys.events('shadow'));
  });

  it('Provider 健康历史保留分页参数并兼容数组响应', async () => {
    const { client, request } = makeClient([
      {
        provider: 'fixture',
        state: 'healthy',
        latencyMs: 10,
        checkedAt: '2026-08-23T00:00:00.000Z',
      },
    ]);
    const page = await fetchProviderHealthHistory(2, client);

    expect(request).toHaveBeenCalledWith(
      '/providers/health/history?page=2&pageSize=20',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(page.page).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(providerKeys.healthHistory(1)).not.toEqual(providerKeys.healthHistory(2));
  });

  it('自动化运行历史按页请求、隔离缓存并兼容旧数组响应', async () => {
    const records = Array.from({ length: 21 }, (_, index) => ({
      id: `run-${index + 1}`,
      jobId: 'job-1',
      status: 'succeeded',
      startedAt: '2026-09-09T00:00:00.000Z',
      error: null,
    }));
    const { client, request } = makeClient(records);
    const page = await fetchAutomationHistory(2, client);

    expect(request).toHaveBeenCalledWith(
      '/automations/history?page=2&pageSize=20',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(page).toMatchObject({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(page.items).toHaveLength(1);
    expect(providerKeys.jobHistory(1)).not.toEqual(providerKeys.jobHistory(2));
    expect(providerKeys.jobHistory(1).slice(0, -1)).toEqual(providerKeys.jobHistory());
  });

  it('Performance 查询 key 包含 mode 和 account，Import key 包含 account', async () => {
    const performance = makeClient([]);
    await fetchPerformanceHistory('shadow', 'account-2', performance.client);
    expect(performance.request).toHaveBeenCalledWith(
      '/performance/history?mode=shadow&accountId=account-2',
      expect.anything(),
    );
    expect(performanceKeys.history('actual', 'account-2')).not.toEqual(
      performanceKeys.history('shadow', 'account-2'),
    );
    await fetchPerformanceTargets(
      'shadow',
      undefined,
      { fxMerge: true, baseCurrency: 'HKD' },
      performance.client,
    );
    expect(performance.request).toHaveBeenLastCalledWith(
      '/performance/targets?scope=portfolio&mode=shadow&fxMerge=true&baseCurrency=HKD',
      expect.anything(),
    );
    expect(
      performanceKeys.targets('actual', '', { fxMerge: false, baseCurrency: 'CNY' }),
    ).not.toEqual(performanceKeys.targets('shadow', '', { fxMerge: true, baseCurrency: 'HKD' }));

    const imports = makeClient([]);
    await fetchImportDrafts('account-2', imports.client);
    expect(imports.request).toHaveBeenCalledWith('/imports?accountId=account-2', expect.anything());
    expect(importKeys.drafts('account-1')).not.toEqual(importKeys.drafts('account-2'));

    expect(
      performanceKeys.allocation('actual', 'account-1', 'positions-a', 'targets-a'),
    ).not.toEqual(performanceKeys.allocation('actual', 'account-1', 'positions-b', 'targets-a'));
    expect(
      performanceKeys.allocation('actual', 'account-1', 'positions-a', 'targets-a'),
    ).not.toEqual(performanceKeys.allocation('actual', 'account-1', 'positions-a', 'targets-b'));
  });

  it('Portfolio 标的搜索保留 TanStack Query 的 AbortSignal', async () => {
    const { client, request } = makeClient([]);
    const controller = new AbortController();
    await searchPortfolioInstruments('600519', client, controller.signal);

    expect(request).toHaveBeenCalledWith(
      '/api/market-data/instruments/search?q=600519',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('Portfolio valuation 使用可注入请求并隔离 mode/account 参数', async () => {
    const portfolio = makeClient({
      totalMarketValue: 100,
      totalCost: 90,
      totalPnl: 10,
      cashValue: 0,
      mode: 'shadow',
      partial: false,
      valuedAt: '2026-08-23T00:00:00.000Z',
      positions: [],
    });
    await fetchPortfolioValuation('shadow', 'account-2', portfolio.client);

    expect(portfolio.request).toHaveBeenCalledWith(
      '/portfolio/valuation?mode=shadow&accountId=account-2',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(portfolioKeys.valuation('actual', 'account-2')).not.toEqual(
      portfolioKeys.valuation('shadow', 'account-2'),
    );
  });

  it('现金快照请求携带用户选择的快照时间', async () => {
    const portfolio = makeClient({});
    await saveCashBalance('account-1', '2000', 'CNY', '2026-08-20T01:00:00.000Z', portfolio.client);

    const init = portfolio.request.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      accountId: 'account-1',
      amount: '2000',
      source: 'manual',
      currency: 'CNY',
      capturedAt: '2026-08-20T01:00:00.000Z',
    });
  });

  it('共享 load state 区分初始错误与已有数据的 stale 状态', () => {
    expect(resolveLoadState([{ isPending: true, isError: false }], false, false)).toBe('loading');
    expect(resolveLoadState([{ isPending: false, isError: true }], false, false)).toBe('error');
    expect(resolveLoadState([{ isPending: false, isError: true }], true, false)).toBe('stale');
    expect(resolveLoadState([{ isPending: false, isError: false }], true, true)).toBe('empty');
    expect(
      resolveLoadState(
        [
          { isPending: false, isError: false },
          { isPending: true, isError: false },
        ],
        true,
        false,
      ),
    ).toBe('loading');
    expect(
      resolveLoadState(
        [
          { isPending: false, isError: true },
          { isPending: true, isError: false },
        ],
        true,
        false,
      ),
    ).toBe('stale');
  });

  it('截图上传通过领域 Mutation API 保留 multipart body', async () => {
    const draft = {};
    const { client, request } = makeClient(draft);
    const file = new File(['fixture'], 'fixture.png', { type: 'image/png' });
    await uploadScreenshotImport({ file, accountId: 'account-1', source: 'unknown' }, client);

    const init = request.mock.calls[0]?.[1];
    expect(request.mock.calls[0]?.[0]).toBe('/imports/screenshot');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });
});

describe('AI 与 Journal 行为契约', () => {
  it('Strategy/AI 写请求集中生成既有 payload', async () => {
    const aiResult = {
      id: 'run-1',
      provider: 'mock',
      model: 'fixture',
      promptVersion: 'v1',
    };
    const ai = makeClient(aiResult);
    await expect(
      createAiRun(
        {
          provider: 'mock',
          model: 'fixture',
          promptVersion: 'v1',
          context: { scope: 'portfolio' },
        },
        ai.client,
      ),
    ).resolves.toEqual(aiResult);
    expect(ai.request).toHaveBeenCalledWith(
      '/ai/runs',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('portfolio') }),
    );

  });

  it('AI 历史请求失败会向 Query 层传播错误', async () => {
    const request = vi.fn().mockRejectedValue(new Error('AI history unavailable'));
    const client = { request } as unknown as DesktopRequestClient;

    await expect(fetchAiRuns(client)).rejects.toThrow('AI history unavailable');
  });

  it('AI 历史加载状态区分 loading、error、stale、empty 和 ready', () => {
    expect(
      resolveAiRunsLoadState({
        isPending: true,
        isError: false,
        isSuccess: false,
        hasRuns: false,
      }),
    ).toBe('loading');
    expect(
      resolveAiRunsLoadState({
        isPending: false,
        isError: true,
        isSuccess: false,
        hasRuns: false,
      }),
    ).toBe('error');
    expect(
      resolveAiRunsLoadState({
        isPending: false,
        isError: true,
        isSuccess: false,
        hasRuns: true,
      }),
    ).toBe('stale');
    expect(
      resolveAiRunsLoadState({
        isPending: false,
        isError: false,
        isSuccess: true,
        hasRuns: false,
      }),
    ).toBe('empty');
    expect(
      resolveAiRunsLoadState({
        isPending: false,
        isError: false,
        isSuccess: true,
        hasRuns: true,
      }),
    ).toBe('ready');
  });

  it('Journal 单笔分析成功返回确定性结果和 AI 运行记录', async () => {
    const { client, request } = makeJournalClient();

    await expect(reviewSingleTrade(reviewTradeFixture, client)).resolves.toEqual({
      plannedVsActual: { deviation: -12 },
      behavior: { discipline: 'needs-review' },
      counterfactual: { avoidedLoss: 120 },
      aiRun: {
        id: 'run-journal-1',
        provider: 'mock',
        model: 'behavior-review-default',
        promptVersion: 'journal-review-v1',
      },
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('Journal 行为分析成功返回指标、时间窗口和 AI 运行记录', async () => {
    const { client, request } = makeJournalClient();

    await expect(reviewBehavior([reviewTradeFixture], client)).resolves.toEqual({
      metrics: { discipline: 'needs-review' },
      window: { windowDays: 4 },
      aiRun: {
        id: 'run-journal-1',
        provider: 'mock',
        model: 'behavior-review-default',
        promptVersion: 'journal-review-v1',
      },
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('Journal 单笔和行为分析失败时均不产生结果', async () => {
    const singleRequest = vi.fn().mockRejectedValue(new Error('single analysis unavailable'));
    const singleClient = { request: singleRequest } as unknown as DesktopRequestClient;
    await expect(reviewSingleTrade(reviewTradeFixture, singleClient)).rejects.toThrow(
      'single analysis unavailable',
    );

    const behaviorRequest = vi.fn().mockRejectedValue(new Error('behavior analysis unavailable'));
    const behaviorClient = { request: behaviorRequest } as unknown as DesktopRequestClient;
    await expect(reviewBehavior([reviewTradeFixture], behaviorClient)).rejects.toThrow(
      'behavior analysis unavailable',
    );
  });

  it('Journal 成功后更新展示结果，后续失败保留上一次结果', async () => {
    const singleResult: JournalReviewResult = {
      plannedVsActual: { deviation: -12 },
      behavior: { discipline: 'needs-review' },
      counterfactual: { avoidedLoss: 120 },
      aiRun: null,
    };
    const behaviorResult: BehaviorReviewResult = {
      metrics: { discipline: 'needs-review' },
      window: { windowDays: 4 },
      aiRun: null,
    };
    let displayedSingle: JournalReviewResult | null = null;
    let displayedBehavior: BehaviorReviewResult | null = null;
    const singleMutation = { mutateAsync: vi.fn().mockResolvedValue(singleResult) };
    const behaviorMutation = { mutateAsync: vi.fn().mockResolvedValue(behaviorResult) };
    const actions = createJournalReviewActions({
      singleReviewMutation: singleMutation,
      behaviorReviewMutation: behaviorMutation,
      setSingleReview: (result) => {
        displayedSingle = result;
      },
      setBehaviorReview: (result) => {
        displayedBehavior = result;
      },
    });

    await expect(actions.reviewSingleTrade(reviewTradeFixture)).resolves.toBe(singleResult);
    await expect(actions.reviewBehavior([reviewTradeFixture])).resolves.toBe(behaviorResult);
    expect(displayedSingle).toBe(singleResult);
    expect(displayedBehavior).toBe(behaviorResult);

    singleMutation.mutateAsync.mockRejectedValueOnce(new Error('single retry failed'));
    behaviorMutation.mutateAsync.mockRejectedValueOnce(new Error('behavior retry failed'));
    await expect(actions.reviewSingleTrade(reviewTradeFixture)).rejects.toThrow(
      'single retry failed',
    );
    await expect(actions.reviewBehavior([reviewTradeFixture])).rejects.toThrow(
      'behavior retry failed',
    );
    expect(displayedSingle).toBe(singleResult);
    expect(displayedBehavior).toBe(behaviorResult);
  });
});

describe('Strategy 任务行为契约', () => {
  it('Strategy 创建版本请求只提交既有版本 endpoint 的 schema payload', async () => {
    const strategy = makeClient({ id: 'version-2', version: 2 });
    await createStrategyVersion(
      { strategyId: 'strategy/1', schema: { version: 1, name: 'fixture' } },
      strategy.client,
    );
    expect(strategy.request).toHaveBeenCalledWith(
      '/backtests/strategies/strategy%2F1/versions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ schema: { version: 1, name: 'fixture' } }),
      }),
    );
  });

  it('Strategy 创建、运行和取消请求保持既有 wire shape', async () => {
    const strategy = makeClient({ id: 'strategy-1' });
    await createStrategy(
      { name: 'fixture', schema: { version: 1, name: 'fixture' } },
      strategy.client,
    );
    await runBacktest('job/1', strategy.client);
    await cancelBacktest('job/1', strategy.client);
    expect(strategy.request).toHaveBeenNthCalledWith(
      1,
      '/backtests/strategies',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(strategy.request).toHaveBeenNthCalledWith(
      2,
      '/backtests/runs/job%2F1/run',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(strategy.request).toHaveBeenNthCalledWith(
      3,
      '/backtests/runs/job%2F1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Strategy 任务取消调用 Mutation、刷新列表并清理 busy 状态', async () => {
    const setBusyAction = vi.fn();
    const load = vi.fn().mockResolvedValue(undefined);
    const cancelMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const handlers = createStrategyActionHandlers({
      name: 'fixture',
      schemaText: '{}',
      busyAction: null,
      setBusyAction,
      toastManager: { add: vi.fn() },
      createMutation: { mutateAsync: vi.fn() },
      fetchBarsMutation: { mutateAsync: vi.fn() },
      queueMutation: { mutateAsync: vi.fn() },
      runMutation: { mutateAsync: vi.fn() },
      cancelMutation,
      load,
    });

    await handlers.cancel('job-1');

    expect(cancelMutation.mutateAsync).toHaveBeenCalledWith('job-1');
    expect(load).toHaveBeenCalledTimes(1);
    expect(setBusyAction).toHaveBeenNthCalledWith(1, 'cancel:job-1');
    expect(setBusyAction).toHaveBeenLastCalledWith(null);
  });

  it('Strategy 任务仅在非终态时轮询', () => {
    expect(shouldPollJobs([{ status: 'queued' }])).toBe(true);
    expect(shouldPollJobs([{ status: 'running' }])).toBe(true);
    expect(shouldPollJobs([{ status: 'succeeded' }, { status: 'cancelled' }])).toBe(false);
    expect(shouldPollJobs([])).toBe(false);
    expect(jobFallbackInterval([{ status: 'queued' }])).toBe(30_000);
    expect(jobFallbackInterval([{ status: 'failed' }])).toBe(false);
  });

  it('Strategy 摘要与详情使用分离接口，SSE 更新按任务 id 合并缓存', async () => {
    const summaryClient = makeClient([]);
    await fetchBacktestJobs(summaryClient.client);
    expect(summaryClient.request).toHaveBeenCalledWith('/backtests/runs', undefined);

    const detailClient = makeClient({ id: 'job/1' });
    await fetchBacktestJob('job/1', detailClient.client);
    expect(detailClient.request).toHaveBeenCalledWith('/backtests/runs/job%2F1', undefined);

    const existing = [{ id: 'job-1', status: 'queued' }] as BacktestJobSummary[];
    expect(
      applyBacktestJobSummaryEvent(existing, {
        id: 'job-1',
        mode: 'V3',
        strategyVersionId: 'version-1',
        status: 'running',
      }),
    ).toEqual([{ id: 'job-1', mode: 'V3', strategyVersionId: 'version-1', status: 'running' }]);
    expect(
      applyBacktestJobSummaryEvent(existing, {
        id: 'old-job',
        strategyVersionId: 'version-1',
        status: 'running',
      }),
    ).toBe(existing);
  });

  it('Strategy 多个订阅者共享一个 SSE 连接并在最后退订时关闭', () => {
    const source = {
      onopen: null as ((event: Event) => void) | null,
      addEventListener: vi.fn(),
      close: vi.fn(),
    };
    const createSource = vi.fn(() => source);
    const connection = createBacktestEventConnection(createSource);
    const firstOpen = vi.fn();
    const secondOpen = vi.fn();

    const unsubscribeFirst = connection.subscribe({
      onOpen: firstOpen,
      onUpdate: vi.fn(),
      onInvalid: vi.fn(),
    });
    const unsubscribeSecond = connection.subscribe({
      onOpen: secondOpen,
      onUpdate: vi.fn(),
      onInvalid: vi.fn(),
    });
    source.onopen?.(new Event('open'));

    expect(createSource).toHaveBeenCalledOnce();
    expect(firstOpen).toHaveBeenCalledOnce();
    expect(secondOpen).toHaveBeenCalledOnce();
    unsubscribeFirst();
    expect(source.close).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(source.close).toHaveBeenCalledOnce();
  });


});
