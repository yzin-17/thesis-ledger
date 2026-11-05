import { describe, it, expect, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
const id = '00000000-0000-4000-8000-000000000010',
  other = '00000000-0000-4000-8000-000000000011';
const at = '2026-10-24T00:00:00Z';
const content = {
  title: '本轮草稿',
  description: '保留原始需求',
  questions: [],
  requirements: [],
  runtimeIntents: [],
  removedRequirements: [],
  definitionText: '{}',
  manualChanges: [],
};
const draft = {
  id,
  ownerId: 'local',
  state: 'editing',
  revision: 1,
  title: content.title,
  savedVersionId: null,
  content,
  validation: { status: 'incomplete', issues: [] },
  createdAt: at,
  updatedAt: at,
};
const selection = {
  kind: 'analyze',
  expectedRevision: 1,
  idempotencyKey: 'mobile-b4-original',
  providerId: 'controlled',
  model: 'fixture',
  unknownCostAcknowledgedAt: at,
  intent: '分析需求',
};
function setup(value: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.authoring,
    fetcher,
  };
}
describe('辅助编写共享合同', () => {
  it('草稿创建与修订提交保留内容，读取核对对象身份', async () => {
    const { api, fetcher } = setup(draft);
    await api.create(content);
    await api.update(id, 1, content);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      expectedRevision: 1,
      content,
    });
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('PATCH');
    await expect(setup({ ...draft, id: other }).api.read(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('非法修订及额外审计字段在请求前拒绝', () => {
    const { api, fetcher } = setup(draft);
    expect(() => api.update(id, 0, content)).toThrow();
    expect(() => api.submit(id, { ...selection, promptVersion: 'injected' })).toThrow();
    expect(() => api.submit(id, { ...selection, inputTokens: 99 })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('不确定提交由调用方复用同一输入与标识，客户端不自动采用', async () => {
    const { api, fetcher } = setup({ id: other });
    await api.submit(id, selection);
    await api.submit(id, selection);
    expect(fetcher.mock.calls.map((c) => JSON.parse(String(c[1]?.body)))).toEqual([
      selection,
      selection,
    ]);
    expect(fetcher.mock.calls.every((c) => !String(c[0]).includes('/apply'))).toBe(true);
  });
  it('取消只发空对象，采用携带修订且动作不能注入路径', async () => {
    const { api, fetcher } = setup({ id });
    await api.action(id, 'cancel', 1);
    await api.action(id, 'apply-analysis', 1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({});
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ expectedRevision: 1 });
    expect(() => api.action(id, '../save', 1)).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('保存保持审核 hash 和修订，拒绝自动生成或省略审核依据', async () => {
    const { api, fetcher } = setup({ strategyId: id, versionId: other, version: 1 });
    const body = {
      name: '用户确认名称',
      expectedRevision: 1,
      reviewedDefinitionHash: 'a'.repeat(64),
    };
    await api.save(id, body);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(body);
    expect(() => api.save(id, { ...body, reviewedDefinitionHash: '' })).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('模型能力只读，未通过验证不宣称可生成，费用未知不补零', async () => {
    const { api, fetcher } = setup([]);
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify([{ name: 'controlled', models: ['fixture'] }])),
    );
    const rows = await api.models();
    expect(rows[0]).toMatchObject({
      available: { analyze: false, generate: false, modify: false },
      costUnknown: true,
      pricingLabel: '费用未知',
    });
    expect(fetcher.mock.calls.every((c) => c[1]?.method === undefined)).toBe(true);
  });
  it('游标和查询信号完整，未知字段或错误响应不变为空草稿', async () => {
    const { content: _, validation: __, ...summary } = draft;
    void _;
    void __;
    const { api, fetcher } = setup({ items: [summary], nextCursor: null });
    const controller = new AbortController();
    await api.list({ id, updatedAt: at }, controller.signal);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      'beforeUpdatedAt=2026-10-24T00%3A00%3A00Z',
    );
    await expect(setup({ items: [summary], nextCursor: { id } }).api.list()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
});
