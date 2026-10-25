import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerContractError,
  safeProviderOAuthUrl,
} from '../src/index.js';
const id = '7b355ed2-bcb7-4234-af08-10441ab20e34';
const now = '2026-10-25T01:00:00.000Z';
const session = {
  sessionId: id,
  providerId: 'longbridge',
  status: 'authorizing',
  authorizationUrl: 'https://openapi.longbridge.com/oauth2/authorize?client_id=fixture',
  expiresAt: '2026-10-25T02:00:00.000Z',
  errorCode: null,
};
const policy = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'b5',
  revision: 2,
  enabled: false,
  routes: [],
  syncState: 'pending',
  effectiveProjection: null,
  effectiveStale: true,
};
const job = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  id,
  status: 'running',
  generation: 0,
  checksum: '',
  acknowledged: false,
  owner: 'fixture',
  leaseValid: true,
  leaseExpiresAt: now,
  retryable: false,
  createdAt: now,
  updatedAt: now,
};
function setup(value: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return { api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher), fetcher };
}
describe('来源与路由共享控制合同', () => {
  it('非法凭证包、清除与保存混用、错误账号用途在网络前拒绝', () => {
    const { api, fetcher } = setup({});
    for (const input of [
      { credential: 'old' },
      { expectedConfigVersion: -1 },
      { clearCredentials: true, credentials: { method: 'token', values: {} } },
    ])
      expect(() => api.market.configureProvider('fixture', input)).toThrow();
    expect(() => api.market.testProvider('fixture', { purpose: 'unknown' })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('账号结论不能用普通健康探测冒充，读取失败不视为未配置成功', async () => {
    const value = {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      providerId: 'fixture',
      requestId: 'b5',
      status: 'unconfigured',
      credentialConfigured: false,
      capabilityResults: {},
    };
    await expect(
      setup(value).api.market.testProvider('fixture', { purpose: 'account_access' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(setup({}).api.market.getProviderRegistry()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('OAuth 仅开放原白名单，拒绝伪域、userinfo、非标准端口及路径', () => {
    expect(safeProviderOAuthUrl(session.authorizationUrl)).toBe(session.authorizationUrl);
    for (const url of [
      'http://openapi.longbridge.com/oauth2/authorize',
      'https://openapi.longbridge.com.evil.test/oauth2/authorize',
      'https://x@openapi.longbridge.com/oauth2/authorize',
      'https://openapi.longbridge.com:444/oauth2/authorize',
      'https://openapi.longbridge.com/authorize',
      'thesis-ledger://oauth',
      'https://127.0.0.1/oauth2/authorize',
    ])
      expect(safeProviderOAuthUrl(url)).toBeNull();
  });
  it('OAuth 查询绑定会话和取消信号，浏览器返回不会改写会话状态', async () => {
    const { api, fetcher } = setup(session);
    const signal = new AbortController().signal;
    await expect(api.providerOAuth.get(id, signal)).resolves.toEqual(session);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(signal);
    await expect(
      setup({ ...session, sessionId: 'another' }).api.providerOAuth.get(id),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(
      setup({ ...session, authorizationUrl: 'https://evil.test/' }).api.providerOAuth.create(
        'fixture',
      ),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('路由保存绑定修订并保留 pending/Effective 陈旧状态', async () => {
    const input = {
      contractVersion: 3 as const,
      consumer: 'thesis-ledger' as const,
      requestId: 'b5',
      expectedRevision: 1,
      revision: 2,
      enabled: false,
      routes: [],
    };
    const { api, fetcher } = setup(policy);
    await expect(api.market.savePolicy(input)).resolves.toEqual(policy);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(input);
    expect(() => api.market.savePolicy({ ...input, expectedRevision: 0 })).toThrow();
    await expect(
      setup({ ...policy, revision: 3 }).api.market.savePolicy(input),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('目录查询核对任务 ID，运行中不能标为已确认，也不因查询错误补投', async () => {
    const { api, fetcher } = setup(job);
    await expect(api.market.catalogJob(id)).resolves.toEqual(job);
    await expect(
      setup({ ...job, acknowledged: true }).api.market.catalogJob(id),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(setup({ ...job, id: 'other' }).api.market.catalogJob(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const succeeded = {
      ...job,
      status: 'succeeded',
      generation: 2,
      checksum: 'a'.repeat(64),
      cursor: 'generation:2',
      count: 0,
      acknowledged: true,
    };
    await expect(setup(succeeded).api.market.startCatalogSync()).resolves.toEqual(succeeded);
  });
});
