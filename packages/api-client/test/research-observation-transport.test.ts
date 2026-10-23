import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  researchReportObservationsSchema,
  researchObservationSubmissionResultSchema,
  researchObservationHistorySchema,
} from '@thesis-ledger/schemas';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const samples = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/research-observation.samples.json', import.meta.url),
    'utf8',
  ),
) as { observations: unknown; submission: unknown; history: unknown };
const observations = researchReportObservationsSchema.parse(samples.observations);
const submission = researchObservationSubmissionResultSchema.parse(samples.submission);
const history = researchObservationHistorySchema.parse(samples.history);
const id = observations.reportId;
const scoped = { view: 'scoped' as const, mode: 'shadow' as const };
const input = {
  submissionId: submission.attempt.submissionId,
  claimId: submission.claimId,
  asOf: observations.asOf,
};
function setup(response: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
  return {
    api: new ThesisLedgerApiClient('https://controlled.test/api/v1', fetcher).research,
    fetcher,
  };
}
it('读取观察使用 GET、固定范围和截止时点并传递取消信号', async () => {
  const { api, fetcher } = setup(observations);
  const controller = new AbortController();
  await expect(
    api.observations(id, { ...scoped, asOf: observations.asOf }, controller.signal),
  ).resolves.toEqual(observations);
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.pathname).toBe(`/api/v1/research/reports/${id}/observations`);
  expect(url.searchParams.get('asOf')).toBe(new Date(observations.asOf).toISOString());
  expect(fetcher.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
  expect(fetcher.mock.calls[0]![1]?.signal).toBe(controller.signal);
});
it('拒绝错报告、错模式及不同截止时点的观察响应', async () => {
  const wrong = structuredClone(observations);
  wrong.reportId = '00000000-0000-4000-8000-000000000100';
  await expect(setup(wrong).api.observations(id, scoped)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
  const otherMode = structuredClone(observations);
  if (otherMode.historicalScope.status === 'known')
    otherMode.historicalScope.snapshot.mode = 'actual';
  await expect(setup(otherMode).api.observations(id, scoped)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
  await expect(
    setup(observations).api.observations(id, { ...scoped, asOf: '2026-11-29T08:00:00Z' }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('显式复核发送提交身份、断言及截止时点，响应绑定原提交', async () => {
  const { api, fetcher } = setup(submission);
  const controller = new AbortController();
  await expect(api.review(id, scoped, input, controller.signal)).resolves.toEqual(submission);
  expect(fetcher.mock.calls[0]![1]?.method).toBe('POST');
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
    ...input,
    asOf: new Date(input.asOf).toISOString(),
  });
  expect(fetcher.mock.calls[0]![1]?.signal).toBe(controller.signal);
});
it('错提交或断言不能作为复核成功返回', async () => {
  const wrong = structuredClone(submission);
  wrong.attempt.submissionId = '00000000-0000-4000-8000-000000000999';
  await expect(setup(wrong).api.review(id, scoped, input)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
  await expect(
    setup(submission).api.review(id, scoped, { ...input, claimId: 'other' }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('观察历史必须绑定报告、逻辑观察及所有版本', async () => {
  await expect(
    setup(history).api.observationHistory(id, history.observationId, scoped),
  ).resolves.toEqual(history);
  const wrong = structuredClone(history);
  wrong.versions[0]!.observationId = '00000000-0000-4000-8000-000000000999';
  await expect(
    setup(wrong).api.observationHistory(id, history.observationId, scoped),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('无效身份及旧报告在发起请求前拒绝自动复核', () => {
  const { api, fetcher } = setup(submission);
  expect(() => api.review('invalid', scoped, input)).toThrow();
  expect(() => api.review(id, { view: 'legacy' }, input)).toThrow('旧报告');
  expect(fetcher).not.toHaveBeenCalled();
});
it('同一毫秒内晚到的响应截止时点也必须拒绝', async () => {
  const wrongRead = structuredClone(observations);
  wrongRead.asOf = '2026-11-30T08:00:00.000000001Z';
  await expect(
    setup(wrongRead).api.observations(id, { ...scoped, asOf: observations.asOf }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  const wrongSubmit = structuredClone(submission);
  wrongSubmit.attempt.version!.inputs.visibleAt = '2026-11-30T08:00:00.000000001Z';
  await expect(setup(wrongSubmit).api.review(id, scoped, input)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
});
