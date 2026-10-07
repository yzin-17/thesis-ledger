import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestResultSchemaV3,
} from '@thesis-ledger/schemas';
import {
  backtestPreparationOptions,
  prepareBacktestRunConfig,
  usePreparationRouteStale,
} from '../src/features/strategy/strategy.preparation.js';
import { marketDataKeys } from '../src/features/market-data/market-data.queries.js';
import { BacktestPriceDisclosure } from '../src/features/strategy/BacktestPriceDisclosure.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import { preparedBacktestSubmission } from '../src/features/strategy/backtest-prepared-submission.js';
import { createStrategyActionHandlers } from '../src/features/strategy/strategy.actions.js';
import {
  createDefaultStrategySchema,
  setStrategyExecutionSymbol,
} from '../src/features/strategy/strategy.schema.js';
import type { BacktestSetupInput } from '../src/features/strategy/strategy.types.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const request = () =>
  backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 3,
    requestId: 'prepare-1',
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    adjustment: 'none',
    accountingBasis: 'raw-events',
    history: { basis: 'fixed-provider-snapshot' },
    runConfig: {
      startDate: '2024-01-02',
      endDate: '2024-03-29',
      dataAsOf: '2026-09-11T00:00:00Z',
      baseCurrency: 'CNY',
      initialCash: { CNY: '10000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      executionModel: fixture('backtest-execution-model.cn-2024q1.json'),
    },
  });
const blocked = () => ({
  contractVersion: 3,
  requestId: 'prepare-1',
  checkedAt: '2026-09-11T00:00:00Z',
  scope: 'execution-window',
  status: 'blocked',
  diagnostics: [
    {
      severity: 'error',
      category: 'data-unavailable',
      code: 'DATA_UNAVAILABLE',
      message: '来源不可用',
      symbol: null,
      capability: null,
      purpose: null,
      dateRange: null,
      routeKey: null,
      missingFields: [],
      incompatibleRules: [],
      targetSources: [],
      suggestedActions: [{ action: 'retry-preflight', description: '恢复来源后重试' }],
    },
  ],
});
const result = () => {
  const manifest = fixture('backtest-snapshot-v3.manifest.json');
  manifest.actualSources[0].provenance.routeIndex = 1;
  return backtestResultSchemaV3.parse({
    source: 'BACKTEST',
    runId: 'run',
    strategyVersionId: 'version',
    snapshotId: 'snapshot',
    engineVersion: 'v3',
    schemaVersion: '3',
    snapshotVersion: 'snapshot-manifest-v3',
    marketRuleVersion: 'v1',
    calendarVersion: 'v1',
    aggregationVersion: 'v1',
    contentHash: 'hash',
    resultChecksum: 'checksum',
    completeness: 'complete',
    executionPriceProtocol: manifest.executionPriceProtocol,
    comparableDataFingerprint: manifest.comparableDataFingerprint,
    actualSources: manifest.actualSources,
    warnings: [],
    rejectedOrders: [],
    simulationFills: [],
    trades: [],
    equityCurve: [],
    metrics: {},
  });
};

describe('普通回测配置准备与披露', () => {
  it('忽略准备前的旧缓存，只因更新后的策略或目录事实失效', () => {
    const client = new QueryClient();
    const stamp = { desiredRevision: 7, effectiveRevision: 1, catalogRevision: 12 };
    function Guard() { return <span>{String(usePreparationRouteStale(stamp, 100))}</span>; }
    const read = () => renderToStaticMarkup(<QueryClientProvider client={client}><Guard /></QueryClientProvider>);
    const policy = { contractVersion: 3, revision: 7, dsaRevision: 1, syncState: 'applied', effectiveStale: false };
    client.setQueryData(marketDataKeys.policy(), { ...policy, revision: 6 }, { updatedAt: 50 });
    expect(read()).toContain('false');
    client.setQueryData(marketDataKeys.policy(), { ...policy, revision: 8 }, { updatedAt: 75 });
    expect(read()).toContain('true');
    client.setQueryData(marketDataKeys.policy(), policy, { updatedAt: 80 });
    client.setQueryData(marketDataKeys.routeCapabilities(), { status: 'complete', catalogRevision: 13 }, { updatedAt: 85 });
    expect(read()).toContain('true');
    client.setQueryData(marketDataKeys.routeCapabilities(), { status: 'complete', catalogRevision: 12 }, { updatedAt: 90 });
    client.setQueryData(marketDataKeys.policy(), { ...policy, revision: 8 }, { updatedAt: 150 });
    expect(read()).toContain('true');
    client.setQueryData(marketDataKeys.policy(), { ...policy, dsaRevision: 2 }, { updatedAt: 160 });
    expect(read()).toContain('true');
    client.setQueryData(marketDataKeys.policy(), policy, { updatedAt: 170 });
    expect(read()).toContain('false');
    client.setQueryData(marketDataKeys.routeCapabilities(), { status: 'complete', catalogRevision: 13 }, { updatedAt: 180 });
    expect(read()).toContain('true');
    client.clear();
  });
  it('提交原准备配置与修订戳；日期、资金、口径、策略改变后拒绝', async () => {
    const manifest = fixture('backtest-snapshot-v3.manifest.json');
    const model = fixture('backtest-execution-model.cn-2024q1.json');
    model.scope.symbol = '159516.SZ';
    model.scope.instrumentType = 'ETF';
    model.segments[0].execution.price = { kind: 'noDailyLimit', reason: '归一化价格坐标' };
    model.segments[0].execution.normalizedExecution = {
      priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal',
      lotSizeConstraint: 'not-applied',
      tickSizeConstraint: 'not-applied',
      dailyPriceLimit: 'not-applied',
      feeBasis: 'simulatedTurnover',
    };
    const stamp = fixture('backtest-preparation-stamp-v3.json');
    const prepared = backtestRunPreparationResultV3Schema.parse({
      contractVersion: 3,
      requestId: 'prepare-1',
      checkedAt: blocked().checkedAt,
      scope: 'execution-window',
      status: 'prepared',
      runConfig: {
        ...request().runConfig,
        schemaVersion: '3',
        executionModel: model,
        executionPriceProtocol: manifest.executionPriceProtocol,
        priceInputBindings: { signals: [], benchmark: { binding: 'execution-series' } },
      },
      actualSource: manifest.actualSources[0],
      executionPreflight: {
        contractVersion: 3,
        requestId: 'prepare-1',
        checkedAt: blocked().checkedAt,
        status: 'ready',
        revisionStamp: stamp,
        diagnostics: [],
      },
    });
    if (prepared.status !== 'prepared') throw new Error('fixture');
    const setup: BacktestSetupInput = {
      period: { start: '2024-01-02', end: '2024-03-29' },
      initialCash: 10000,
      baseCurrency: 'CNY',
      adjustment: 'qfq',
      prepared,
    };
    const submitted = preparedBacktestSubmission(stamp.strategyVersionId, setup, 'intent-1');
    expect(submitted.runConfig).toEqual(prepared.runConfig);
    expect(submitted.preparationStamp).toEqual(stamp);
    const queueMutation = { mutateAsync: vi.fn().mockResolvedValue({ id: 'run-current', status: 'queued' }) };
    const load = vi.fn().mockResolvedValue(undefined);
    const handlers = createStrategyActionHandlers({
      name: '',
      schemaText: '{}',
      busyAction: null,
      setBusyAction: vi.fn(),
      toastManager: { add: vi.fn() },
      createMutation: { mutateAsync: vi.fn() },
      queueMutation,
      runMutation: { mutateAsync: vi.fn() },
      cancelMutation: { mutateAsync: vi.fn() },
      retryMutation: { mutateAsync: vi.fn() },
      load,
    });
    const version = {
      id: stamp.strategyVersionId,
      version: 1,
      schema: setStrategyExecutionSymbol(createDefaultStrategySchema('回测策略'), '600519.SH'),
    };
    expect(await handlers.startBacktest({ ...version, schema: { schemaVersion: '1' } }, setup)).toBe(
      false,
    );
    expect(queueMutation.mutateAsync).not.toHaveBeenCalled();
    expect(await handlers.startBacktest(version, setup)).toBe(true);
    await vi.waitFor(() => expect(queueMutation.mutateAsync).toHaveBeenCalledOnce());
    expect(queueMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ contractVersion: 3, preparationStamp: stamp }),
    );
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    for (const changed of [
      { ...setup, initialCash: 20000 },
      { ...setup, adjustment: 'hfq' as const },
      { ...setup, period: { ...setup.period, end: '2024-03-28' } },
      { ...setup, baseCurrency: 'USD' as const },
    ])
      expect(() =>
        preparedBacktestSubmission(stamp.strategyVersionId, changed, 'intent-2'),
      ).toThrow('重新准备');
    expect(() =>
      preparedBacktestSubmission('22222222-2222-4222-8222-222222222222', setup, 'intent-2'),
    ).toThrow('重新准备');
  });
  it.each(['change', 'close'])('输入变化或关闭隔离晚到响应：%s', async (action) => {
    const queryClient = new QueryClient();
    let complete!: (value: unknown) => void;
    const send = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const client = { request: send } as DesktopRequestClient;
    const submitted = { key: 'original', request: request() };
    const observer = new QueryObserver(
      queryClient,
      backtestPreparationOptions('original', submitted, client),
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const signal = send.mock.calls[0]![1].signal as AbortSignal;
    if (action === 'change')
      observer.setOptions(backtestPreparationOptions('changed', submitted, client));
    else unsubscribe();
    expect(signal.aborted).toBe(true);
    complete(blocked());
    await Promise.resolve();
    await Promise.resolve();
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(
      queryClient.getQueryData(['backtest-preparation', 'original', 'prepare-1']),
    ).toBeUndefined();
    unsubscribe();
    queryClient.clear();
  });
  it('提交意图并传递取消信号，保留阻断诊断', async () => {
    const send = vi.fn().mockResolvedValue(blocked());
    const signal = new AbortController().signal;
    expect(
      await prepareBacktestRunConfig(request(), signal, { request: send } as DesktopRequestClient),
    ).toEqual(blocked());
    expect(send).toHaveBeenCalledWith(
      '/backtests/run-config/prepare',
      expect.objectContaining({ method: 'POST', signal, body: JSON.stringify(request()) }),
    );
  });
  it('拒绝串联到另一请求的响应', async () => {
    const send = vi.fn().mockResolvedValue({ ...blocked(), requestId: 'old-request' });
    await expect(
      prepareBacktestRunConfig(request(), undefined, { request: send } as DesktopRequestClient),
    ).rejects.toThrow('当前请求不一致');
  });
  it('拒绝伪装成可提交配置的阻断响应', async () => {
    const send = vi.fn().mockResolvedValue({ ...blocked(), runConfig: request().runConfig });
    await expect(
      prepareBacktestRunConfig(request(), undefined, { request: send } as DesktopRequestClient),
    ).rejects.toThrow();
  });
  it('展示实际备用来源、供应商定义分红及未知成本', () => {
    const html = renderToStaticMarkup(<BacktestPriceDisclosure result={result()} />);
    for (const text of [
      '前复权',
      '归一化份额研究',
      '固定供应商快照',
      '供应商定义',
      'hithink-financial-api',
      '备用源',
      '未知',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('按冻结成本假设计算');
  });
  it('损坏协议不会展示为有效结果', () => {
    const html = renderToStaticMarkup(
      <BacktestPriceDisclosure result={{ ...result(), actualSources: [] }} />,
    );
    expect(html).toContain('运行协议无法读取');
    expect(html).not.toContain('本次运行的价格与记账协议');
  });
  it.each(['incompatible', 'unverified'] as const)('基准%s不显示兼容收益声明并保留重放版本', (status) => {
    const value = backtestResultSchemaV3.parse({
      ...result(),
      benchmarkCompatibility: {
        status,
        missingFields: status === 'unverified' ? ['costAssumption'] : [],
        differentFields: status === 'incompatible' ? ['source'] : [],
        costAssumption: status === 'unverified'
          ? { kind: 'unavailable' }
          : { kind: 'zero-cost', version: 'explicit-test-v1' },
      },
    });
    const html = renderToStaticMarkup(<BacktestPriceDisclosure result={value} />);
    expect(html).toContain(status === 'incompatible'
      ? '协议不兼容，不计算可比超额收益'
      : '兼容性未核实，不进入同一评价组');
    expect(html).not.toContain('收益、来源与成本协议兼容');
    expect(html).toContain('重放版本');
    expect(html).toContain('snapshot-manifest-v3');
  });
});
