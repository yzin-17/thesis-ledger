// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backtestRunPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { BacktestPreparationFailureDetails } from '../src/features/strategy/BacktestPreparationFailureDetails.js';
import { StrategySubmissionList } from '../src/features/strategy/StrategySubmissionList.js';
import type { BacktestJob } from '../src/features/strategy/strategy.types.js';

const list = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ strategySubmissions: { list } }),
}));
const model = JSON.parse(readFileSync('../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json', 'utf8'));
const version = '11111111-1111-4111-8111-111111111111';
const preparation = backtestRunPreparationRequestV3Schema.parse({
  contractVersion: 3, requestId: 'failure-ui', strategyVersionId: version,
  adjustment: 'none', accountingBasis: 'raw-events', history: { basis: 'fixed-provider-snapshot' },
  runConfig: { startDate: '2024-01-02', endDate: '2024-03-29', dataAsOf: '2026-11-08T00:00:00Z',
    baseCurrency: 'CNY', initialCash: { CNY: '100000.1234567890123456789' },
    valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '16:00', pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' }, executionModel: model },
});
const job: BacktestJob = { id: version, strategyVersionId: version, mode: 'V3', status: 'failed',
  errorSummary: '行情读取未完成', input: { contractVersion: 3, schemaVersion: '3', kind: 'preparation-failure', submissionId: version, preparation } };
let root: Root | undefined;
let client: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
async function render(node: React.ReactNode) {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => root!.render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>));
  await act(async () => new Promise(done => setTimeout(done, 20)));
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; client?.clear(); document.body.innerHTML = ''; });

describe('准备失败任务的展示归属', () => {
  it('详情显示失败阶段、原始资金与重新创建说明', async () => {
    await render(<BacktestPreparationFailureDetails job={job} />);
    expect(document.body.textContent).toContain('准备与预检失败');
    expect(document.body.textContent).toContain('行情读取未完成');
    expect(document.body.textContent).toContain('100000.1234567890123456789 CNY');
    expect(document.body.textContent).toContain('尚未执行回测');
    expect(document.querySelector('button')).toBeNull();
  });
  it('已关联普通任务的提交退出顶部，净值确认记录继续保留', async () => {
    list.mockResolvedValue([{ id: version, kind: 'ordinary', state: 'submitted', createdAt: '2026-11-08T00:00:00Z', prepared: null, outcome: { id: version } }]);
    await render(<StrategySubmissionList />);
    expect(document.body.textContent).not.toContain('后台提交');
    expect(document.querySelector('details')).toBeNull();
    await act(async () => root!.unmount()); root = undefined;
    list.mockResolvedValue([{ id: version, kind: 'nav', state: 'blocked', createdAt: '2026-11-08T00:00:00Z', prepared: null, outcome: { reason: '净值准备未通过' } }]);
    await render(<StrategySubmissionList />);
    expect(document.body.textContent).toContain('后台提交（1）');
    expect(document.body.textContent).toContain('净值准备未通过');
  });
});
