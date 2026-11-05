import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
import { experiment, id, other } from './strategy-management.fixture.js';
function setup(value: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.optimization,
    fetcher,
  };
}
describe('实验共享管理合同', () => {
  it('分页保留范围、游标和信号，未知费用及读取限制不改写', async () => {
    const { api, fetcher } = setup({
      items: [experiment],
      totalCount: 1,
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    const controller = new AbortController();
    const page = await api.list(
      { limit: 20, search: '中文 空格', sourceMode: 'existing' },
      controller.signal,
    );
    expect(page.items[0]?.costUsed).toBeNull();
    expect(page.items[0]?.readEligibility?.state).toBe('restricted');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      'search=%E4%B8%AD%E6%96%87+%E7%A9%BA%E6%A0%BC',
    );
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
  it('非法创建、分页、UUID 和结束集合在请求前拒绝', () => {
    const { api, fetcher } = setup(experiment);
    expect(() => api.create({} as never)).toThrow();
    expect(() => api.list({ limit: 101 })).toThrow();
    expect(() => api.read('../escape')).toThrow();
    expect(() =>
      api.finalize(id, {
        candidateIds: [id],
        selectedCandidateId: other,
        expectedStage: 'awaiting_finalization',
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('克隆不生成新标识，失去响应后的显式重试复用同一请求体', async () => {
    const { api, fetcher } = setup(experiment);
    const body = {
      name: '本轮克隆',
      idempotencyKey: 'same-frozen-key',
      acknowledgeUnknownCost: true,
    };
    await api.clone(other, body);
    await api.clone(other, body);
    expect(fetcher.mock.calls.map((c) => JSON.parse(String(c[1]?.body)))).toEqual([body, body]);
  });
  it('改名、取消核对实验身份，不自动推进其他状态', async () => {
    const { api, fetcher } = setup(experiment);
    await api.rename(id, '新名称');
    await api.cancel(id);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({});
    await expect(setup({ ...experiment, id: other }).api.cancel(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('比较拒绝别的实验候选，失败不转为空结果或触发写入', async () => {
    const { api, fetcher } = setup({
      experiment,
      candidates: [],
      attempts: [
        {
          id,
          experimentId: other,
          modelKey: 'a',
          attempt: 1,
          status: 'failed',
          createdAt: experiment.createdAt,
        },
      ],
      baseline: { runRefs: {}, metrics: {} },
      note: '原说明',
    });
    await expect(api.compare(id)).rejects.toBeInstanceOf(ThesisLedgerContractError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBeUndefined();
  });
  it('缺失页游标及不完整能力响应拒绝，不能据此启用 AI', async () => {
    await expect(
      setup({
        items: [],
        totalCount: 2,
        pageInfo: { hasNextPage: true, nextCursor: null },
      }).api.list(),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(setup({ providers: [] }).api.capabilities()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
});
