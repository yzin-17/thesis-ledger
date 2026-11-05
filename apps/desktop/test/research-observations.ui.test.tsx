// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  researchReportDetailSchema,
  researchReportObservationsSchema,
  researchObservationSubmissionResultSchema,
  researchObservationHistorySchema,
  type ResearchReportDetail,
} from '@thesis-ledger/schemas';
import { ResearchObservations } from '../src/features/ai/ResearchObservations.js';
import { ResearchNextActions } from '../src/features/ai/ResearchNextActions.js';
import { researchKeys } from '../src/features/ai/research.queries.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';

const api = vi.hoisted(() => ({
  observations: vi.fn(),
  review: vi.fn(),
  observationHistory: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ research: api }) }));
const raw = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/research-observation.samples.json', 'utf8'),
) as { report: unknown; observations: unknown; submission: unknown; history: unknown };
const report = () => researchReportDetailSchema.parse(structuredClone(raw.report));
const observed = () => researchReportObservationsSchema.parse(structuredClone(raw.observations));
let host: HTMLDivElement, root: Root, client: QueryClient;
async function mount(value: ResearchReportDetail = report(), contextKey = 'shadow:instrument') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ResearchObservations report={value} contextKey={contextKey} />
      </QueryClientProvider>,
    ),
  );
}
async function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    check();
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-30T08:00:02Z'));
  setIdentitySession(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } },
  });
  api.observations.mockImplementation(async (id: string) => ({ ...observed(), reportId: id }));
  api.observationHistory.mockResolvedValue(researchObservationHistorySchema.parse(raw.history));
  api.review.mockImplementation(
    async (_id: string, _locator: unknown, body: { submissionId: string; asOf: string }) => {
      const value = researchObservationSubmissionResultSchema.parse(
        structuredClone(raw.submission),
      );
      value.attempt.submissionId = body.submissionId;
      value.attempt.version!.inputs.visibleAt = body.asOf;
      return value;
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  setIdentitySession(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('展开和历史按钮只读取保存数据，不自动创建复核或新研究', async () => {
  await mount();
  expect(api.observations).not.toHaveBeenCalled();
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('已计算方向复核'));
  expect(api.observations).toHaveBeenCalledTimes(1);
  expect(api.review).not.toHaveBeenCalled();
  await click('查看历次复核');
  await wait(() => expect(api.observationHistory).toHaveBeenCalledTimes(1));
  expect(host.textContent).toContain('100 → 110 CNY');
  expect(api.submit).not.toHaveBeenCalled();
});
it('只有按需按钮发送明确的断言提交并刷新保存结果', async () => {
  await mount();
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('按需复核'));
  await click('按需复核');
  await wait(() => expect(host.textContent).toContain('再次按需复核'));
  expect(api.review).toHaveBeenCalledTimes(1);
  expect(api.review.mock.calls[0]![2]).toMatchObject({
    claimId: observed().items[0]!.claimId,
    asOf: expect.any(String),
  });
  expect(api.observations.mock.calls.length).toBeGreaterThan(1);
  expect(api.submit).not.toHaveBeenCalled();
});
it('网络响应丢失后复用同提交身份及截止时点找回原尝试', async () => {
  api.review.mockRejectedValueOnce(new Error('controlled response lost'));
  await mount();
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('按需复核'));
  await click('按需复核');
  await wait(() => expect(host.textContent).toContain('本次提交尚未确认'));
  const input = api.review.mock.calls[0]![2];
  await click('收起复核状态');
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('找回本次提交'));
  await click('找回本次提交');
  await wait(() => expect(api.review).toHaveBeenCalledTimes(2));
  expect(api.review.mock.calls[1]![2]).toEqual(input);
});
it('切换对象和模式中止旧提交并关闭旧结果，晚到响应不会污染新范围', async () => {
  let finish!: (value: unknown) => void;
  api.review.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('按需复核'));
  await click('按需复核');
  const signal = api.review.mock.calls[0]![3] as AbortSignal;
  const other = report();
  other.id = '00000000-0000-4000-8000-000000000100';
  if (other.historicalScope.status === 'known') other.historicalScope.snapshot.mode = 'actual';
  await mount(other, 'actual:another-instrument');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(researchObservationSubmissionResultSchema.parse(raw.submission)));
  expect(host.textContent).not.toContain('100 → 110 CNY');
  expect(host.textContent).toContain('查看复核状态');
});
it('权限刷新失败时隐藏已有正文；身份变化后不会继承旧观察', async () => {
  await mount();
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('100 → 110 CNY'));
  api.observations.mockRejectedValue(new Error('controlled permission changed'));
  await act(async () => {
    await client.invalidateQueries({ queryKey: researchKeys.root });
  });
  await wait(() => expect(host.textContent).toContain('复核状态暂不可读'));
  expect(host.textContent).not.toContain('100 → 110 CNY');
  await act(async () =>
    setIdentitySession({
      token: 'A'.repeat(43),
      expiresAt: '2099-01-01T00:00:00Z',
      principal: {
        id: '10000000-0000-4000-8000-000000000002',
        username: 'other',
        displayName: '其他身份',
      },
    }),
  );
  expect(host.textContent).toContain('查看复核状态');
  expect(host.textContent).not.toContain('复核状态暂不可读');
});
it('资料不足保留未知与具体原因，不显示旧的经济结果', async () => {
  const value = observed(),
    evaluation = value.items[0]!.current!.evaluation;
  evaluation.status = 'insufficient_data';
  evaluation.reasons = ['price_missing'];
  evaluation.economic.returnRate = null;
  evaluation.economic.directionMatched = null;
  value.statistics.calculatedSamples = 0;
  value.statistics.matchedSamples = 0;
  value.statistics.exclusions = [{ reason: 'price_missing', count: 1 }];
  api.observations.mockResolvedValue(value);
  await mount();
  await click('查看复核状态');
  await wait(() => expect(host.textContent).toContain('复核资料不足'));
  expect(host.textContent).toContain('固定起止日存在缺价');
  expect(host.textContent).not.toContain('100 → 110 CNY');
});
it('准备新研究只打开既有准备入口，不调用研究或复核接口', async () => {
  const onPrepare = vi.fn();
  await act(async () =>
    root.render(<ResearchNextActions report={report()} onPrepare={onPrepare} />),
  );
  await click('准备新研究');
  expect(onPrepare).toHaveBeenCalledTimes(1);
  expect(api.submit).not.toHaveBeenCalled();
  expect(api.review).not.toHaveBeenCalled();
});
