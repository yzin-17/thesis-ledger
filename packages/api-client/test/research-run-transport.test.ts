import { describe, it, expect, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
const id = '00000000-0000-4000-8000-000000000010';
const row = {
  id,
  provider: 'controlled',
  model: 'fixture',
  promptVersion: 'v1',
  status: 'failed',
  context: null,
  createdAt: '2026-10-24T00:00:00Z',
};
const setup = (value: unknown) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).researchRuns,
    fetcher,
  };
};
describe('研究运行共享传输', () => {
  it('读取保留未知历史状态，创建收据不补写缺失上下文', async () => {
    await expect(setup({ ...row, status: 'legacy-status' }).api.detail(id)).resolves.toMatchObject({
      status: 'legacy-status',
    });
    const receipt = { id, provider: 'controlled', model: 'fixture', promptVersion: 'v1' };
    await expect(
      setup(receipt).api.create({ provider: 'controlled', model: 'fixture', promptVersion: 'v1' }),
    ).resolves.toEqual(receipt);
  });
  it('分页筛选与取消信号完整，兼容历史数组响应', async () => {
    const { api, fetcher } = setup([row]);
    const controller = new AbortController();
    await expect(
      api.list(
        { view: 'research', source: 'account', status: 'failed', cursor: 'next', limit: 7 },
        controller.signal,
      ),
    ).resolves.toMatchObject({ items: [row], hasMore: false });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: 'research',
      source: 'account',
      status: 'failed',
      cursor: 'next',
      limit: '7',
    });
    expect(fetcher.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });
  it('拒绝错误运行与错误重试来源的响应', async () => {
    await expect(
      setup({ ...row, id: '00000000-0000-4000-8000-000000000011' }).api.detail(id),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    const prefill = {
      sourceRunId: '00000000-0000-4000-8000-000000000011',
      question: '检查风险',
      context: { scope: 'portfolio', mode: 'actual' },
      templateId: null,
      sourceOutcome: 'failed',
      contextState: 'valid',
      requiresUnknownOutcomeAcknowledgement: false,
    };
    await expect(setup(prefill).api.retryPrefill(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('拒绝不一致分页，不把错误数据展示为空历史', async () => {
    await expect(
      setup({ items: [row], hasMore: true, nextCursor: null }).api.list(),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('新建与重试不接受客户端审计字段', () => {
    const { api, fetcher } = setup({});
    expect(() =>
      api.create({ question: '风险', context: { scope: 'portfolio' }, inputTokens: 123 }),
    ).toThrow();
    expect(() =>
      api.create({ question: '风险', context: { scope: 'portfolio' }, retryOfRunId: id }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
