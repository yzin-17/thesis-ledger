import { describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../src/integration/dsa/dsa.client.js';
import { MarketDataController } from '../src/market/market-data.controller.js';

const session = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  providerId: 'longbridge',
  status: 'authorizing',
  authorizationUrl: 'https://openapi.longbridge.com/oauth2/authorize?state=test',
  expiresAt: '2026-09-14T12:00:00Z',
  errorCode: null,
};

describe('Provider OAuth proxy', () => {
  it('创建授权仅转发 Client ID 和控制信封，响应不透传令牌', async () => {
    const client = Object.create(DsaClient.prototype) as DsaClient;
    const control = vi
      .spyOn(client, 'control')
      .mockResolvedValue({ ...session, accessToken: 'must-not-return' });
    expect(await client.longbridgeOAuth({ kind: 'create', clientId: 'client' })).toEqual(session);
    const [path, init] = control.mock.calls[0]!;
    expect(path).toBe('/api/v1/thesis-ledger/control/providers/longbridge/oauth/sessions');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      contractVersion: 1,
      consumer: 'thesis-ledger',
      requestId: expect.any(String),
      clientId: 'client',
    });
  });

  it('查询与取消使用各自路径，拒绝不完整状态', async () => {
    const client = Object.create(DsaClient.prototype) as DsaClient;
    const control = vi.spyOn(client, 'control').mockResolvedValue({ session: null });
    expect(await client.longbridgeOAuth({ kind: 'current' })).toEqual({ session: null });
    expect(control).toHaveBeenLastCalledWith(expect.stringContaining('/sessions/current'), {});
    control.mockResolvedValue(session);
    await client.longbridgeOAuth({ kind: 'get', sessionId: session.sessionId });
    expect(control).toHaveBeenLastCalledWith(
      expect.stringContaining(`/sessions/${session.sessionId}`),
      {},
    );
    await client.longbridgeOAuth({ kind: 'cancel', sessionId: session.sessionId });
    expect(control).toHaveBeenLastCalledWith(
      expect.stringContaining(`/sessions/${session.sessionId}/cancel`),
      { method: 'POST' },
    );
    control.mockResolvedValue({ status: 'succeeded', accessToken: 'must-not-return' });
    await expect(
      client.longbridgeOAuth({ kind: 'get', sessionId: session.sessionId }),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('页面创建入口拒绝令牌及多余字段', () => {
    const dsa = { longbridgeOAuth: vi.fn() };
    const controller = new MarketDataController({} as never, {} as never, dsa as never);
    for (const input of [
      null,
      {},
      { clientId: '' },
      { clientId: 'client', accessToken: 'secret' },
    ]) {
      expect(() => controller.createProviderOAuth(input)).toThrow('请提供有效的 Client ID');
    }
    expect(dsa.longbridgeOAuth).not.toHaveBeenCalled();
    controller.createProviderOAuth({ clientId: ' client ' });
    expect(dsa.longbridgeOAuth).toHaveBeenLastCalledWith({ kind: 'create', clientId: 'client' });
  });
});
