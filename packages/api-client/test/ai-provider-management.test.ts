import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
const name = 'B5/受控模型';
const revision = '2026-10-25T00:00:00.000Z';
const requestId = '7b355ed2-bcb7-4234-af08-10441ab20e34';
const input = {
  name,
  baseUrl: 'http://127.0.0.1:3336/v1',
  models: ['fixture'],
  authMode: 'none' as const,
  enabled: false,
};
const record = {
  name,
  type: 'ai',
  enabled: false,
  priority: 100,
  capabilities: ['chat'],
  health: 'unknown',
  updatedAt: revision,
};
function setup(value: unknown = record) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).aiProviders,
    fetcher,
  };
}
describe('AI Provider 共享管理合同', () => {
  it('通用目录配置经过保存、回显和目录请求不丢字段', async () => {
    const modelCatalog = {
      url: 'http://127.0.0.1:3336/catalog',
      itemsPath: '/result',
      idPath: '/name',
      pagination: {
        pageParam: 'page',
        pageSize: 100,
        startPage: 1,
        stopWhen: 'empty-page' as const,
      },
    };
    const { api, fetcher } = setup({ ...record, modelCatalog });
    await expect(api.save({ ...input, modelCatalog })).resolves.toEqual({
      ...record,
      modelCatalog,
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ modelCatalog });
    const catalog = setup({
      models: ['fixture'],
      modelDetails: [{ id: 'fixture' }],
      fetchedAt: revision,
    });
    await catalog.api.models({ baseUrl: input.baseUrl, authMode: 'none', modelCatalog });
    expect(JSON.parse(String(catalog.fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      modelCatalog,
    });
  });
  it('非法目录规则在 HTTP 前拒绝，默认清除明确发送 null', async () => {
    const { api, fetcher } = setup();
    expect(() =>
      api.save({
        ...input,
        modelCatalog: { url: 'http://127.0.0.1:3336/catalog', itemsPath: 'invalid', idPath: '/id' },
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await api.save({ ...input, modelCatalog: null });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).modelCatalog).toBeNull();
  });
  it('保存与列表只返回白名单投影，凭证不能进入读取缓存', async () => {
    const value = {
      ...record,
      apiKey: 'fixture-dummy',
      credentialsRef: 'fixture-dummy',
      arbitrary: { secret: true },
    };
    await expect(setup(value).api.save(input)).resolves.toEqual(record);
    const { api, fetcher } = setup([value]);
    const controller = new AbortController();
    await expect(api.list(controller.signal)).resolves.toEqual([record]);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
  it('非法模型、价格、凭证组合、路由在发请求前拒绝', () => {
    const { api, fetcher } = setup();
    for (const patch of [
      { models: ['fixture', 'fixture'] },
      { apiKey: 'fixture-dummy' },
      { modelPricing: { missing: { costPer1kInput: 0 } } },
      { modelPricing: { fixture: { costPer1kInput: -1 } } },
      { baseUrl: 'file:///tmp/model' },
      { ownerId: 'other' },
    ])
      expect(() => api.save({ ...input, ...patch } as never)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('保存保留零单价、未知单价、超时、修订与原始请求，不隐式启用', async () => {
    const { api, fetcher } = setup();
    const body = {
      ...input,
      expectedRevision: revision,
      modelPricing: { fixture: { costPer1kInput: 0 } },
      firstOutputTimeoutMs: 120000,
    };
    const signal = new AbortController().signal;
    await api.save(body, signal);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(body);
    expect(body.modelPricing.fixture).not.toHaveProperty('costPer1kOutput');
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(signal);
  });
  it('草稿测试保持取消信号；保存后测试核对名称和请求身份', async () => {
    const result = {
      name,
      status: 'healthy',
      message: '连接通过',
      credentialConfigured: false,
      requestId,
    };
    const { api, fetcher } = setup(result);
    const signal = new AbortController().signal;
    await api.testDraft({ ...input, testKind: 'connection', requestId }, signal);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(signal);
    await api.test(name, { testKind: 'connection', requestId }, signal);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      'B5%2F%E5%8F%97%E6%8E%A7%E6%A8%A1%E5%9E%8B/test',
    );
    await expect(
      setup({ ...result, requestId: 'other' }).api.test(name, { requestId }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('启停与删除携带引用修订；无修订删除保持无请求体', async () => {
    const { api, fetcher } = setup();
    await api.setEnabled(name, false, {
      expectedRevision: revision,
      clearResearchDefault: true,
      expectedSettingsRevision: 'r2',
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      enabled: false,
      expectedRevision: revision,
      clearResearchDefault: true,
      expectedSettingsRevision: 'r2',
    });
    await api.remove(name);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBeUndefined();
  });
  it('计划与执行分离，未授权和错误指纹零请求，执行不自动重试', async () => {
    const authorization = {
      operationId: requestId,
      planFingerprint: 'a'.repeat(64),
      authorized: true as const,
      maxCalls: 2,
      allowTextFallback: false,
    };
    const { api, fetcher } = setup();
    expect(() =>
      api.testAndSave(input, { ...authorization, authorized: false } as never),
    ).toThrow();
    expect(() => api.testAndSave(input, { ...authorization, planFingerprint: 'stale' })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await api.testAndSave(input, authorization);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      provider: input,
      authorization,
    });
  });
  it('用途证据不能由连接测试伪造；错误列表不转换为空', async () => {
    await expect(
      setup([{ ...record, executionRoutes: [{ readiness: { state: 'ready' } }] }]).api.list(),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(setup({}).api.list()).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('默认模型必须带设置修订，响应保留候选的费用未知状态', async () => {
    const settings = {
      revision: 'r3',
      researchDefault: null,
      candidates: [
        {
          providerId: name,
          providerName: name,
          model: 'fixture',
          enabled: false,
          health: 'unknown',
          authMode: 'none',
          priceConfigured: false,
        },
      ],
    };
    const { api, fetcher } = setup(settings);
    await expect(api.settings()).resolves.toEqual(settings);
    expect(() => api.updateSettings({ researchDefault: null, expectedRevision: '' })).toThrow();
    await api.updateSettings({ researchDefault: null, expectedRevision: 'r2' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('验证取消复用服务端布尔回执，身份绑定请求路径和 operationId', async () => {
    const { api, fetcher } = setup({ cancelled: true });
    await expect(api.cancelValidation(name, requestId)).resolves.toEqual({ cancelled: true });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/validation/cancel');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      operationId: requestId,
    });
  });
});
