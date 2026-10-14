// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthoringEditor } from '../src/features/strategy-authoring/use-authoring-editor.js';
import { emptyAuthoringContent } from '../src/features/strategy-authoring/use-authoring-draft.js';

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  submit: vi.fn(),
  models: vi.fn(),
  flush: vi.fn(),
  useServerContent: vi.fn(),
  operation: vi.fn(),
  proposal: vi.fn(),
  action: vi.fn(),
}));
vi.mock('../src/features/strategy-authoring/authoring.api.js', () => ({
  authoringApi: {
    history: mocks.history,
    submit: mocks.submit,
    operation: mocks.operation,
    proposal: mocks.proposal,
    action: mocks.action,
  },
  fetchAuthoringModels: mocks.models,
}));
vi.mock('../src/features/strategy-authoring/use-authoring-draft.js', () => ({
  emptyAuthoringContent: {
    title: '验收',
    description: '明确分析需求',
    questions: [],
    requirements: [],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
  },
  useAuthoringDraft: () => ({
    content: emptyAuthoringContent,
    flush: mocks.flush,
    useServerContent: mocks.useServerContent,
    dirty: false,
    busy: false,
    failure: null,
    query: { data: { revision: 1, state: 'editing' } },
  }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let latest: ReturnType<typeof useAuthoringEditor>;
let root: Root;
let client: QueryClient;
let host: HTMLDivElement;
const props = { id: 'draft', ownerId: 'alice', onDirtyChange: vi.fn(), onSaved: vi.fn() };
function Probe() {
  latest = useAuthoringEditor(props);
  return <p>{latest.failure}</p>;
}
const settle = async (assertion: () => void) =>
  vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assertion();
  });
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.history.mockResolvedValue([]);
  mocks.models.mockResolvedValue(
    ['A', 'B'].map((key) => ({
      key,
      providerId: 'local',
      model: key,
      available: { analyze: true, generate: true, modify: true },
      costUnknown: false,
      pricingLabel: '零费率',
    })),
  );
  mocks.flush.mockResolvedValue({ revision: 1, content: emptyAuthoringContent });
  mocks.submit
    .mockRejectedValueOnce(new Error('响应中断'))
    .mockResolvedValue({ id: 'original-operation' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  await settle(() => expect(latest.models.data).toHaveLength(2));
  await act(async () => latest.setModelKey('A'));
  await act(async () => latest.submit('analyze'));
  await settle(() => expect(latest.failure).toBe('响应中断'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
describe('响应未知时保留原提交意图', () => {
  it('读取服务器最新草稿后使用服务端提案状态，清除已过期的本地建议缓存', async () => {
    const summary = {
      id: 'op',
      revision: 1,
      status: 'succeeded',
      disposition: 'unapplied',
      selection: { kind: 'modify' },
      updatedAt: '2026-10-06T00:00:00Z',
      proposalId: 'proposal',
      proposalStatus: 'pending',
    };
    const pending = { id: 'proposal', revision: 1, status: 'pending', payload: {} };
    mocks.history.mockResolvedValue([summary]);
    mocks.operation.mockResolvedValue({ id: 'op', revision: 1 });
    mocks.proposal.mockResolvedValue(pending);
    mocks.action.mockResolvedValue(pending);
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['desktop', 'authoring-history'] });
    });
    await settle(() => expect(latest.operation.data?.id).toBe('op'));
    await act(async () => latest.applyOperation('proposal'));
    await settle(() => expect(latest.proposalView?.status).toBe('pending'));
    mocks.history.mockResolvedValue([{ ...summary, proposalStatus: 'expired' }]);
    mocks.proposal.mockResolvedValue({ ...pending, status: 'expired' });
    mocks.useServerContent.mockResolvedValue(undefined);
    await act(async () => latest.readLatest());
    await settle(() => expect(latest.proposalView?.status).toBe('expired'));
  });
  it('服务端明确拒绝生成条件后展示遗漏原文，释放请求并允许用户发起修正后的意图', async () => {
    const original = mocks.submit.mock.calls[0]![1] as Record<string, unknown>;
    mocks.submit.mockRejectedValueOnce(
      new ThesisLedgerApiError(400, {
        error: 'AUTHORING_CONDITIONS_INCOMPLETE',
        message: '请完成条件确认和需求审核',
        issues: ['需求清单遗漏原文：完整句子'],
      }),
    );
    await act(async () => latest.replaySubmission());
    await settle(() => expect(latest.failure).toContain('需求清单遗漏原文：完整句子'));
    expect(latest.submissionUnknown).toBe(false);
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    await act(async () => latest.setModelKey('B'));
    await act(async () => latest.submit('analyze'));
    await settle(() => expect(mocks.submit).toHaveBeenCalledTimes(3));
    const next = mocks.submit.mock.calls[2]![1] as Record<string, unknown>;
    expect(next.model).toBe('B');
    expect(next.idempotencyKey).not.toBe(original.idempotencyKey);
  });
  it.each([400, 503])('未识别的 %s 响应仍保留原请求，不自动重试', async (status) => {
    const original = mocks.submit.mock.calls[0]![1];
    mocks.submit.mockRejectedValueOnce(
      new ThesisLedgerApiError(status, {
        error: 'AUTHORING_DELIVERY_PENDING',
        message: '投递未确认',
      }),
    );
    await act(async () => latest.replaySubmission());
    await settle(() => expect(latest.failure).toBe('投递未确认'));
    expect(latest.submissionUnknown).toBe(true);
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit.mock.calls[1]![1]).toEqual(original);
  });
  it('空历史不能释放原意图，更换模型被拦截；主动重试复用原模型和幂等键', async () => {
    const original = mocks.submit.mock.calls[0]![1] as Record<string, unknown>;
    await act(async () => latest.recoverSubmission());
    await settle(() => expect(latest.failure).toContain('历史尚未确认原提交'));
    expect(latest.submissionUnknown).toBe(true);
    await act(async () => latest.setModelKey('B'));
    await act(async () => latest.submit('analyze'));
    await settle(() => expect(latest.failure).toContain('上次提交结果尚未确认'));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await act(async () => latest.replaySubmission());
    await settle(() => expect(latest.submissionUnknown).toBe(false));
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit.mock.calls[1]![1]).toEqual(original);
    expect(original.model).toBe('A');
  });
  it('历史读取失败保留原意图，只有匹配同一幂等键的操作才能释放', async () => {
    mocks.history.mockRejectedValueOnce(new Error('历史不可用'));
    await act(async () => latest.recoverSubmission());
    await settle(() => expect(latest.failure).toBe('历史不可用'));
    expect(latest.submissionUnknown).toBe(true);
    const original = mocks.submit.mock.calls[0]![1] as Record<string, unknown>;
    mocks.history.mockResolvedValue([
      {
        id: 'original-operation',
        revision: 1,
        status: 'failed',
        selection: { ...original },
        updatedAt: '2026-10-06T00:00:00Z',
      },
    ]);
    await act(async () => latest.recoverSubmission());
    await settle(() => expect(latest.submissionUnknown).toBe(false));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});
