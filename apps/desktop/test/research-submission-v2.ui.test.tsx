// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  researchSubmissionV2Schema,
  researchResultV2Schema,
  type ResearchSubmissionV2,
  type ResearchSubmissionReceiptV2,
} from '@thesis-ledger/schemas';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { useResearchSubmission } from '../src/features/ai/use-research-submission.js';
import { readPendingResearch } from '../src/features/ai/research-submission-pending.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';

const api = vi.hoisted(() => ({
  submit:
    vi.fn<
      (input: ResearchSubmissionV2, signal?: AbortSignal) => Promise<ResearchSubmissionReceiptV2>
    >(),
  find: vi.fn<
    (input: ResearchSubmissionV2, signal?: AbortSignal) => Promise<ResearchSubmissionReceiptV2>
  >(),
  cancel:
    vi.fn<
      (input: ResearchSubmissionV2, signal?: AbortSignal) => Promise<ResearchSubmissionReceiptV2>
    >(),
  created: vi.fn(),
}));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ research: api }) }));
const sample = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/research-v2.samples.json', 'utf8'),
) as { input: unknown; result: unknown };
const draft = researchSubmissionV2Schema.parse(sample.input);
const result = researchResultV2Schema.parse(sample.result);
const runId = '00000000-0000-4000-8000-000000000088';
const receipt = (
  input: ResearchSubmissionV2,
  status: ResearchSubmissionReceiptV2['status'] = 'queued',
): ResearchSubmissionReceiptV2 => ({
  version: 2,
  runId,
  submissionId: input.submissionId,
  status,
  reused: true,
  scopeSnapshot: { ...result.scopeSnapshot, mode: input.mode },
});
let root: Root;
let client: QueryClient;
let host: HTMLDivElement;
let view: ReturnType<typeof useResearchSubmission>;
let mounted = false;
function Harness({ mode }: { mode: ResearchSubmissionV2['mode'] }) {
  view = useResearchSubmission(mode, true, api.created);
  return <output>{view.pending?.submissionId ?? ''}</output>;
}
async function render(mode: ResearchSubmissionV2['mode'] = 'shadow') {
  if (!mounted) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mounted = true;
  }
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness mode={mode} />
      </QueryClientProvider>,
    );
  });
}
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const settled = () =>
  vi.waitFor(async () => {
    await tick();
    expect(view.busy).toBe(false);
  });
async function unmount() {
  await act(async () => {
    root.unmount();
  });
  client.clear();
  host.remove();
  mounted = false;
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setIdentitySession(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  if (mounted) await unmount();
  setIdentitySession(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('V2 提交身份与未知响应恢复', () => {
  it('默认修订变化明确没有创建任务，可刷新设置后重新确认', async () => {
    const code = 'RESEARCH_SETTINGS_REVISION_CHANGED';
    api.submit.mockRejectedValueOnce(
      new ThesisLedgerApiError(409, { error: code, errorCode: code, message: '默认模型已变化' }),
    );
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await settled();
    expect(view.pending).toBeNull();
    expect(api.submit).toHaveBeenCalledOnce();
    expect(api.created).not.toHaveBeenCalled();
  });
  it('响应丢失、关闭再打开后按原身份找回，不再创建或改写输入', async () => {
    api.submit.mockRejectedValueOnce(new TypeError('controlled lost response'));
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await settled();
    const first = api.submit.mock.calls[0]![0];
    expect(view.pending).toEqual(first);
    await unmount();
    await render();
    expect(view.pending).toEqual(first);
    api.find.mockResolvedValueOnce(receipt(first));
    await act(async () => view.find());
    await settled();
    expect(api.find.mock.calls[0]![0]).toEqual(first);
    expect(api.submit).toHaveBeenCalledOnce();
    expect(api.created).toHaveBeenCalledOnce();
    expect(readPendingResearch('local-workspace', 'shadow')).toBeNull();
  });
  it('未知响应的重试固定原问题、修订和标识，不接受新的草稿替换', async () => {
    api.submit.mockRejectedValueOnce(new TypeError('controlled loss'));
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await settled();
    const first = api.submit.mock.calls[0]![0];
    api.submit.mockResolvedValueOnce(receipt(first));
    await act(async () =>
      view.submit({
        ...draft,
        mode: 'shadow',
        question: '不同问题',
        researchSettingsRevision: 'changed',
      }),
    );
    await settled();
    expect(api.submit.mock.calls[1]![0]).toEqual(first);
  });
  it('停止等待会中止实际客户端信号；找回未命中不会自动创建，随后可确认取消', async () => {
    api.submit.mockImplementationOnce(
      (_input, signal) =>
        new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new DOMException('controlled abort', 'AbortError')),
          ),
        ),
    );
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await tick();
    const first = api.submit.mock.calls[0]![0];
    await act(async () => {
      view.retry();
      view.stopWaiting();
    });
    await settled();
    expect(api.submit).toHaveBeenCalledOnce();
    expect(api.submit.mock.calls[0]![1]?.aborted).toBe(true);
    api.find.mockRejectedValueOnce(new ThesisLedgerApiError(404, { error: 'not_found' }));
    await act(async () => view.find());
    await settled();
    expect(view.pending).toEqual(first);
    api.cancel.mockResolvedValueOnce(receipt(first, 'cancelled'));
    await act(async () => view.cancel());
    await settled();
    expect(api.cancel.mock.calls[0]![0]).toEqual(first);
    expect(api.submit).toHaveBeenCalledOnce();
    expect(api.created).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });
  it.each([
    'RESEARCH_REQUIRED_EVIDENCE_UNAVAILABLE',
    'RESEARCH_INPUT_BUDGET_EXCEEDED',
    'RESEARCH_V2_WRITES_DISABLED',
  ])('明确提交前拒绝可恢复编辑且没有再次发送：%s', async (errorCode) => {
    api.submit.mockRejectedValueOnce(
      new ThesisLedgerApiError(400, { error: errorCode, errorCode, message: '受控提交前拒绝' }),
    );
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await settled();
    expect(view.pending).toBeNull();
    expect(view.error).toBe('受控提交前拒绝');
    expect(api.submit).toHaveBeenCalledOnce();
    expect(api.created).not.toHaveBeenCalled();
  });
  it.each([400, 409, 503])('其他失败不能擅自认定未创建或自动更换标识：%s', async (status) => {
    api.submit.mockRejectedValueOnce(new ThesisLedgerApiError(status, { error: 'unclassified' }));
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await settled();
    expect(view.pending).toEqual(api.submit.mock.calls[0]![0]);
    expect(api.submit).toHaveBeenCalledOnce();
  });
  it('切换模式中止旧信号；忽略中止的晚到响应不打开新模式中的旧报告', async () => {
    let resolve!: (value: ResearchSubmissionReceiptV2) => void;
    api.submit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await tick();
    const first = api.submit.mock.calls[0]![0];
    await render('actual');
    expect(view.pending).toBeNull();
    expect(api.submit.mock.calls[0]![1]?.aborted).toBe(true);
    await act(async () => resolve(receipt(first)));
    await settled();
    expect(api.created).not.toHaveBeenCalled();
    expect(view.pending).toBeNull();
  });
  it('离开页面后晚到响应不再触发导航回调', async () => {
    let resolve!: (value: ResearchSubmissionReceiptV2) => void;
    api.submit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await tick();
    const first = api.submit.mock.calls[0]![0];
    await unmount();
    await act(async () => resolve(receipt(first)));
    await tick();
    expect(api.created).not.toHaveBeenCalled();
  });
  it('会话存储不可写时在发送前停止', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('controlled unavailable');
    });
    await render();
    await act(async () => view.submit({ ...draft, mode: 'shadow' }));
    await tick();
    expect(api.submit).not.toHaveBeenCalled();
    expect(view.error).toContain('无法保留提交标识');
  });
});
