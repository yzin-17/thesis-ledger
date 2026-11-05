import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  researchResultV2Schema,
  researchSubmissionV2Schema,
  researchReportComparisonSchema,
} from '@thesis-ledger/schemas';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const id = '00000000-0000-4000-8000-000000000099';
const sample = JSON.parse(
  readFileSync(new URL('../../schemas/fixtures/research-v2.samples.json', import.meta.url), 'utf8'),
) as { input: unknown; result: unknown; frozen: { evidence: unknown[] } };
const result = researchResultV2Schema.parse(sample.result);
const input = researchSubmissionV2Schema.parse(sample.input);
function row() {
  return {
    id,
    status: 'succeeded',
    question: input.question,
    createdAt: result.createdAt,
    updatedAt: result.createdAt,
    historicalScope: { status: 'known', snapshot: result.scopeSnapshot },
    resultVersion: 2,
    availability: 'available',
    summary: result.inference.conclusion,
    quality: result.quality,
    errorCode: null,
    errorSummary: null,
  };
}
const setup = (response: unknown) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
  return {
    api: new ThesisLedgerApiClient('https://controlled.test/api/v1', fetcher).research,
    fetcher,
  };
};
const scoped = { view: 'scoped' as const, mode: result.scopeSnapshot.mode };

it('工具审计携带正文 locator 和取消信号，拒绝其他报告及分页坏响应', async () => {
  const value = { runId: id, items: [], hasMore: false, nextCursor: null };
  const { api, fetcher } = setup(value);
  const abort = new AbortController();
  await expect(api.tools(id, { ...scoped, limit: 1 }, abort.signal)).resolves.toEqual(value);
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.pathname).toBe(`/api/v1/research/reports/${id}/tool-calls`);
  expect(url.searchParams.get('mode')).toBe(scoped.mode);
  expect(url.searchParams.get('scope')).toBe('all');
  expect(fetcher.mock.calls[0]![1]?.signal).toBe(abort.signal);
  await expect(
    setup({ ...value, runId: '00000000-0000-4000-8000-000000000098' }).api.tools(id, scoped),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  await expect(setup({ ...value, hasMore: true }).api.tools(id, scoped)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
});

const comparison = () =>
  researchReportComparisonSchema.parse(
    JSON.parse(
      readFileSync(
        new URL('../../schemas/fixtures/research-comparison.samples.json', import.meta.url),
        'utf8',
      ),
    ),
  );
it('比较绑定两端标识和当前范围，使用 GET 并传递取消信号', async () => {
  const value = comparison(),
    abort = new AbortController();
  const { api, fetcher } = setup(value);
  await expect(
    api.compare(id, { ...scoped, beforeId: value.previous!.id }, abort.signal),
  ).resolves.toEqual(value);
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.pathname).toBe(`/api/v1/research/reports/${id}/comparison`);
  expect(url.searchParams.get('beforeId')).toBe(value.previous!.id);
  expect(fetcher.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
  expect(fetcher.mock.calls[0]![1]?.signal).toBe(abort.signal);
});
it('比较不能接收另一份当前报告、错误前序或其他模式的响应', async () => {
  const value = comparison(),
    beforeId = value.previous!.id;
  const wrongCurrent = structuredClone(value);
  wrongCurrent.current.id = beforeId;
  await expect(setup(wrongCurrent).api.compare(id, { ...scoped, beforeId })).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
  const wrongPrevious = structuredClone(value);
  wrongPrevious.previous!.id = id;
  await expect(
    setup(wrongPrevious).api.compare(id, { ...scoped, beforeId }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  await expect(
    setup(value).api.compare(id, { ...scoped, mode: 'actual', beforeId }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('显式跨模式不可比可读取，默认前序不能夹带另一模式', async () => {
  const value = comparison();
  if (value.previous?.historicalScope.status !== 'known') throw new Error('受控范围缺失');
  value.previous.historicalScope.snapshot.mode = 'actual';
  value.status = 'incompatible';
  value.evidence = [];
  value.groups = value.groups.map((group) => ({ ...group, status: 'unavailable', fields: [] }));
  value.issues = [{ code: 'mode', message: '账户模式不同，不作字段比较' }];
  await expect(
    setup(value).api.compare(id, { ...scoped, beforeId: value.previous.id }),
  ).resolves.toMatchObject({ status: 'incompatible' });
  value.selection = 'default';
  await expect(setup(value).api.compare(id, scoped)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
});
it('不把自身、旧 V1 或没有证据的响应包装为成功比较', async () => {
  const value = comparison();
  expect(() => setup(value).api.compare(id, { ...scoped, beforeId: id })).toThrow(
    '请选择另一份研究报告',
  );
  const empty = structuredClone(value);
  empty.evidence = [];
  await expect(
    setup(empty).api.compare(id, { ...scoped, beforeId: value.previous!.id }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  const legacy = structuredClone(value);
  legacy.previous!.resultVersion = 1;
  legacy.previous!.historicalScope = {
    status: 'unrecorded',
    snapshot: null,
    label: '历史范围未记录',
  };
  await expect(
    setup(legacy).api.compare(id, { ...scoped, beforeId: value.previous!.id }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('创建能力只读且保留取消信号；未知范围不能成为可创建权限', async () => {
  const capabilities = {
    version: 'research-capabilities-v2',
    canCreate: false,
    scopes: ['instrument', 'strategy'],
  };
  const { api, fetcher } = setup(capabilities);
  const abort = new AbortController();
  await expect(api.capabilities(abort.signal)).resolves.toEqual(capabilities);
  expect(String(fetcher.mock.calls[0]![0])).toBe(
    'https://controlled.test/api/v1/research/capabilities',
  );
  expect(fetcher.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
  expect(fetcher.mock.calls[0]![1]?.signal).toBe(abort.signal);
  await expect(
    setup({ ...capabilities, scopes: ['admin'] }).api.capabilities(),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('范围类别筛选传到请求并核验返回对象', async () => {
  const page = { items: [row()], hasMore: false, nextCursor: null };
  const { api, fetcher } = setup(page);
  await expect(api.list({ ...scoped, kind: 'instrument' })).resolves.toMatchObject({
    items: [{ id }],
  });
  expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('kind')).toBe('instrument');
  await expect(setup(page).api.list({ ...scoped, kind: 'account' })).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
});
it('大小写输入与服务端规范收据关联一致', async () => {
  const canonical = 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const body = {
    ...input,
    submissionId: canonical.toUpperCase(),
    scope: { scope: 'position' as const, accountId: canonical.toUpperCase(), symbol: '600519.sh' },
  };
  if (result.scopeSnapshot.scope !== 'instrument') throw new Error('规范标的样例缺失');
  const scopeSnapshot = { ...result.scopeSnapshot, scope: 'position', accountId: canonical };
  const { api, fetcher } = setup({
    version: 2,
    runId: id,
    submissionId: canonical,
    status: 'queued',
    reused: false,
    scopeSnapshot,
  });
  await expect(api.submit(body)).resolves.toMatchObject({ submissionId: canonical });
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toMatchObject({
    submissionId: canonical,
    scope: { accountId: canonical, symbol: '600519.SH' },
  });
});
it('研究列表绑定模式并保留取消信号；历史不能混入默认范围', async () => {
  const page = { items: [row()], hasMore: false, nextCursor: null };
  const { api, fetcher } = setup(page);
  const abort = new AbortController();
  await expect(api.list(scoped, abort.signal)).resolves.toMatchObject({ items: [{ id }] });
  expect(fetcher.mock.calls[0]![1]?.signal).toBe(abort.signal);
  expect(String(fetcher.mock.calls[0]![0])).toContain('/api/v1/research/reports?');
  await expect(
    setup(page).api.list({ ...scoped, mode: scoped.mode === 'actual' ? 'shadow' : 'actual' }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  await expect(setup(page).api.list({ view: 'legacy' })).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
});
it('详情核对任务、对象及模式，不把可信范围改为当前范围', async () => {
  const detail = { ...row(), result, submission: input };
  await expect(setup(detail).api.detail(id, scoped)).resolves.toMatchObject({ id });
  await expect(
    setup(detail).api.detail('00000000-0000-4000-8000-000000000098', scoped),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  await expect(
    setup(detail).api.detail(id, { ...scoped, scope: 'account', accountId: id }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it('引用核对实际证据标识、父任务和范围', async () => {
  const binding = result.evidenceBindings[0]!;
  const evidenceId = binding.audit.evidenceId;
  const value = {
    version: 2,
    runId: id,
    scopeSnapshot: result.scopeSnapshot,
    evidence: sample.frozen.evidence[0],
    toolCallId: binding.toolCallId,
  };
  await expect(setup(value).api.evidence(id, evidenceId, scoped)).resolves.toMatchObject({
    runId: id,
  });
  await expect(setup(value).api.evidence(id, id, scoped)).rejects.toBeInstanceOf(
    ThesisLedgerContractError,
  );
  await expect(
    setup(value).api.evidence(id, evidenceId, { view: 'legacy' }),
  ).rejects.toBeInstanceOf(ThesisLedgerContractError);
});
it.each(['submit', 'find', 'cancel'] as const)(
  '提交收据核对标识和冻结范围且不丢取消信号：%s',
  async (action) => {
    const receipt = {
      version: 2,
      runId: id,
      submissionId: input.submissionId,
      status: 'queued',
      reused: action !== 'submit',
      scopeSnapshot: result.scopeSnapshot,
    };
    const { api, fetcher } = setup(receipt);
    const abort = new AbortController();
    await expect(api[action](input, abort.signal)).resolves.toMatchObject({ runId: id });
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', signal: abort.signal });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(input);
    await expect(setup({ ...receipt, submissionId: id }).api[action](input)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  },
);
