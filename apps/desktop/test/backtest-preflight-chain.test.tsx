import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { backtestRunPreparationRequestV3Schema, backtestRunPreparationResultV3Schema } from '@thesis-ledger/schemas';
import { backtestPreparationOptions, prepareBacktestRunConfig } from '../src/features/strategy/strategy.preparation.js';
import { BacktestPreflightDiagnostics } from '../src/features/strategy/BacktestPreflightDiagnostics.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
function setup() {
  const config = { startDate: '2024-01-02', endDate: '2024-03-29', dataAsOf: '2026-09-11T00:00:00Z',
    baseCurrency: 'CNY', initialCash: { CNY: '10000' }, valuationPolicy: {
      baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00', pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' },
    executionModel: fixture('backtest-execution-model.cn-2024q1.json') };
  const request = backtestRunPreparationRequestV3Schema.parse({ contractVersion: 3, requestId: 'chain-1',
    strategyVersionId: '11111111-1111-4111-8111-111111111111', adjustment: 'none',
    accountingBasis: 'raw-events', history: { basis: 'fixed-provider-snapshot' }, runConfig: config });
  const ready = { contractVersion: 3, requestId: request.requestId, checkedAt: config.dataAsOf,
    status: 'ready', revisionStamp: fixture('backtest-preparation-stamp-v3.json'), diagnostics: [] };
  const prepared = backtestRunPreparationResultV3Schema.parse({ contractVersion: 3, requestId: request.requestId,
    checkedAt: config.dataAsOf, scope: 'execution-window', status: 'prepared',
    runConfig: { ...config, schemaVersion: '3', executionPriceProtocol: fixture('execution-price.raw-events.json'),
      priceInputBindings: { signals: [], benchmark: { binding: 'execution-series' } } },
    actualSource: fixture('backtest-snapshot-v3.manifest.json').actualSources[0], executionPreflight: ready });
  return { request, ready, prepared };
}

describe('配置准备与联合预检请求链', () => {
  it('准备响应返回前已取消时不发起第二次请求', async () => {
    const h = setup();
    const controller = new AbortController();
    const send = vi.fn().mockImplementation(async () => {
      controller.abort();
      return h.prepared;
    });
    await expect(prepareBacktestRunConfig(h.request, controller.signal, { request: send } as DesktopRequestClient)).rejects.toThrow();
    expect(send).toHaveBeenCalledOnce();
  });

  it('两步通过才发布配置，第二步原样使用准备后的运行协议', async () => {
    const h = setup();
    const send = vi.fn().mockResolvedValueOnce(h.prepared).mockResolvedValueOnce(h.ready);
    const result = await prepareBacktestRunConfig(h.request, undefined, { request: send } as DesktopRequestClient);
    expect(result.status).toBe('prepared');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toBe('/backtests/run-config/preflight');
    expect(JSON.parse(send.mock.calls[1]![1].body).runConfig).toEqual(h.prepared.status === 'prepared' ? h.prepared.runConfig : null);
  });

  it('联合预检阻断时不保留可提交配置，并显示具体能力和来源', async () => {
    const h = setup();
    const diagnostic = { severity: 'error', category: 'data-unavailable', code: 'DATA_UNAVAILABLE',
      message: '事件来源不可用', symbol: '159516.SZ', capability: 'SPLIT_EVENT', purpose: 'corporateActions',
      dateRange: { startDate: '2024-01-02', endDate: '2024-03-29' }, routeKey: null,
      missingFields: ['corporateActions.SPLIT_EVENT.upstream_failure'], incompatibleRules: [],
      targetSources: [{ providerId: 'rqdata', upstreamSource: 'fund-split', routeIndex: 0 }],
      suggestedActions: [{ action: 'retry-preflight', description: '恢复来源后重新检查' }] };
    const send = vi.fn().mockResolvedValueOnce(h.prepared).mockResolvedValueOnce({ ...h.ready, status: 'blocked', diagnostics: [diagnostic] });
    const result = await prepareBacktestRunConfig(h.request, undefined, { request: send } as DesktopRequestClient);
    expect(result.status).toBe('blocked');
    expect(result).not.toHaveProperty('runConfig');
    if (result.status !== 'blocked') throw new Error('blocked fixture required');
    const html = renderToStaticMarkup(<BacktestPreflightDiagnostics diagnostics={result.diagnostics} />);
    for (const text of ['159516.SZ', '份额拆并', '2024-03-29', 'rqdata', 'fund-split', '恢复来源后重新检查']) expect(html).toContain(text);
  });

  it.each(['identity', 'revision', 'transport'])('拒绝联合预检%s失败', async (failure) => {
    const h = setup();
    const send = vi.fn().mockResolvedValueOnce(h.prepared);
    if (failure === 'transport') send.mockRejectedValueOnce(new Error('预检连接失败'));
    else send.mockResolvedValueOnce({ ...h.ready,
      requestId: failure === 'identity' ? 'old' : h.ready.requestId,
      revisionStamp: { ...h.ready.revisionStamp, desiredRevision: failure === 'revision' ? 999 : h.ready.revisionStamp.desiredRevision } });
    await expect(prepareBacktestRunConfig(h.request, undefined, { request: send } as DesktopRequestClient)).rejects.toThrow();
  });

  it.each(['change', 'close'])('联合预检期间%s取消请求并隔离晚到成功', async (action) => {
    const h = setup();
    const queryClient = new QueryClient();
    let complete!: (value: unknown) => void;
    const send = vi.fn().mockResolvedValueOnce(h.prepared).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const client = { request: send } as DesktopRequestClient;
    const submitted = { key: 'original', request: h.request };
    const observer = new QueryObserver(queryClient, backtestPreparationOptions('original', submitted, client));
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      const signal = send.mock.calls[1]![1].signal as AbortSignal;
      if (action === 'change') observer.setOptions(backtestPreparationOptions('changed', submitted, client));
      else unsubscribe();
      expect(signal.aborted).toBe(true);
      complete(h.ready);
      await Promise.resolve();
      await Promise.resolve();
      expect(observer.getCurrentResult().data).toBeUndefined();
      expect(queryClient.getQueryData(['backtest-preparation', 'original', 'chain-1'])).toBeUndefined();
    } finally { unsubscribe(); queryClient.clear(); }
  });
});
