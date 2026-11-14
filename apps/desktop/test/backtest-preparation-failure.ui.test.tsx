// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backtestRunPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { BacktestPreparationFailureDetails } from '../src/features/strategy/BacktestPreparationFailureDetails.js';
import { BacktestSubmissionFeedback } from '../src/features/strategy/BacktestSubmissionFeedback.js';
import type { BacktestJob } from '../src/features/strategy/strategy.types.js';

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
  it('提交阻塞原因在当前表单显示', async () => {
    await render(<BacktestSubmissionFeedback receipt={{ id: version, kind: 'ordinary', state: 'blocked', createdAt: '2026-11-08T00:00:00Z', prepared: null, outcome: { reason: '回测准备未通过' } }} error={null} onRetry={vi.fn()} onConfirm={vi.fn()} confirming={false} />);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('回测准备未通过');
  });
  it('状态读取失败可重新读取，保留当前提交', async () => {
    const retry = vi.fn();
    await render(<BacktestSubmissionFeedback receipt={{ id: version, kind: 'ordinary', state: 'preparing', createdAt: '2026-11-08T00:00:00Z', prepared: null, outcome: null }} error={new Error('状态读取失败')} onRetry={retry} onConfirm={vi.fn()} confirming={false} />);
    expect(document.body.textContent).toContain('状态读取失败');
    await act(async () => document.querySelector<HTMLButtonElement>('button')!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
