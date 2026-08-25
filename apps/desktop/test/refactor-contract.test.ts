import { describe, expect, it, vi } from 'vitest';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import { fetchRiskAudit, fetchRiskEvents } from '../src/features/risk/risk.api.js';
import { riskAuditQueryOptions, riskKeys } from '../src/features/risk/risk.queries.js';
import { fetchProviderHealthHistory } from '../src/features/providers/providers.api.js';
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
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
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
  fetchStrategyBars,
  queueBacktest,
  runBacktest,
} from '../src/features/strategy/strategy.api.js';
import { createStrategyActionHandlers } from '../src/features/strategy/strategy.actions.js';
import { shouldPollJobs } from '../src/features/strategy/strategy.queries.js';
import type { BacktestJob, StrategyRecord } from '../src/features/strategy/strategy.types.js';
import {
  fetchPortfolioValuation,
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
      '/market-data/instruments/search?q=600519',
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
      expect.stringMatching(/^\/portfolio\/valuation\?mode=shadow&accountId=account-2&t=/),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(portfolioKeys.valuation('actual', 'account-2')).not.toEqual(
      portfolioKeys.valuation('shadow', 'account-2'),
    );
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

    const strategy = makeClient({ id: 'job-1' });
    await queueBacktest(
      {
        id: 'job-1',
        strategyVersionId: 'version-1',
        status: 'queued',
        period: { start: '2026-01-01', end: '2026-08-23' },
        dataAsOf: '2026-08-23',
        warnings: [],
        strategy: {},
        bars: [],
        initialCash: 100_000,
      },
      strategy.client,
    );
    expect(strategy.request).toHaveBeenCalledWith(
      '/backtests/jobs',
      expect.objectContaining({ method: 'POST' }),
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
      '/backtests/jobs/job%2F1/run',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(strategy.request).toHaveBeenNthCalledWith(
      3,
      '/backtests/jobs/job%2F1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Strategy 回测只使用版本 Schema，按版本号排序并将 Dialog 参数传入队列后自动运行', async () => {
    const fetchBarsMutation = { mutateAsync: vi.fn().mockResolvedValue([{ date: '2026-01-01' }]) };
    const queueMutation = {
      mutateAsync: vi.fn().mockResolvedValue({ id: 'job-2' } as BacktestJob),
    };
    const runMutation = { mutateAsync: vi.fn().mockResolvedValue({ id: 'job-2' } as BacktestJob) };
    const handlers = createStrategyActionHandlers({
      name: '',
      schemaText: JSON.stringify({ universe: { symbols: ['global-symbol'] } }),
      busyAction: null,
      setBusyAction: vi.fn(),
      toastManager: { add: vi.fn() },
      createMutation: { mutateAsync: vi.fn() },
      fetchBarsMutation,
      queueMutation,
      runMutation,
      cancelMutation: { mutateAsync: vi.fn() },
      load: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      handlers.queue({
        id: 'strategy-1',
        name: 'fixture',
        versions: [
          { id: 'version-1', version: 1, schema: { universe: { symbols: ['old-symbol'] } } },
          { id: 'version-3', version: 3, schema: { universe: { symbols: ['new-symbol'] } } },
        ],
      }),
    ).resolves.toBe(true);
    expect(fetchBarsMutation.mutateAsync).toHaveBeenCalledWith('new-symbol');
    expect(queueMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyVersionId: 'version-3',
        period: { start: '2025-01-01', end: '2025-01-31' },
        initialCash: 100_000,
        strategy: { universe: { symbols: ['new-symbol'] } },
      }),
    );
    expect(runMutation.mutateAsync).toHaveBeenCalledWith('job-2');
  });

  it('Strategy 启动失败保留排队任务并清理 busy 状态，资金和日期无效时不请求 bars', async () => {
    const setBusyAction = vi.fn();
    const fetchBarsMutation = { mutateAsync: vi.fn().mockResolvedValue([]) };
    const queueMutation = {
      mutateAsync: vi.fn().mockResolvedValue({ id: 'job-3' } as BacktestJob),
    };
    const toastManager = { add: vi.fn() };
    const handlers = createStrategyActionHandlers({
      name: '',
      schemaText: '{}',
      busyAction: null,
      setBusyAction,
      toastManager,
      createMutation: { mutateAsync: vi.fn() },
      fetchBarsMutation,
      queueMutation,
      runMutation: { mutateAsync: vi.fn().mockRejectedValue(new Error('worker unavailable')) },
      cancelMutation: { mutateAsync: vi.fn() },
      load: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      handlers.startBacktest(
        { id: 'version-1', version: 1, schema: { universe: { symbols: ['600519.SH'] } } },
        { period: { start: '2026-02-01', end: '2026-01-01' }, initialCash: 0 },
      ),
    ).resolves.toBe(false);
    expect(fetchBarsMutation.mutateAsync).not.toHaveBeenCalled();
    await expect(
      handlers.startBacktest(
        { id: 'version-1', version: 1, schema: { universe: { symbols: ['600519.SH'] } } },
        { period: { start: '2026-01-01', end: '2026-01-31' }, initialCash: 100_000 },
      ),
    ).resolves.toBe(true);
    expect(queueMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '回测启动失败',
        description: expect.stringContaining('队列'),
      }),
    );
    expect(setBusyAction).toHaveBeenLastCalledWith(null);
  });

  it('Strategy bars 网络异常不会继续排队，HTTP 错误仍回退为空 bars', async () => {
    const networkRequest = vi.fn().mockRejectedValue(new Error('network down'));
    const networkClient = { request: networkRequest } as unknown as DesktopRequestClient;
    await expect(fetchStrategyBars('600519', networkClient)).rejects.toThrow('network down');

    const httpRequest = vi.fn().mockRejectedValue(new ThesisLedgerApiError(503, null));
    const httpClient = { request: httpRequest } as unknown as DesktopRequestClient;
    await expect(fetchStrategyBars('600519', httpClient)).resolves.toEqual([]);

    const queueMutation = { mutateAsync: vi.fn().mockResolvedValue({} as BacktestJob) };
    const handlers = createStrategyActionHandlers({
      name: 'fixture',
      schemaText: JSON.stringify({ universe: { symbols: ['600519'] } }),
      busyAction: null,
      setBusyAction: vi.fn(),
      toastManager: { add: vi.fn() },
      createMutation: { mutateAsync: vi.fn() },
      fetchBarsMutation: { mutateAsync: vi.fn().mockRejectedValue(new Error('network down')) },
      queueMutation,
      runMutation: { mutateAsync: vi.fn() },
      cancelMutation: { mutateAsync: vi.fn() },
      load: vi.fn().mockResolvedValue(undefined),
    });
    const strategy = { id: 'strategy-1', versions: [{ id: 'version-1' }] } as StrategyRecord;
    await handlers.queue(strategy);
    expect(queueMutation.mutateAsync).not.toHaveBeenCalled();
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
  });
});
