import { describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const envelope = { contractVersion: 3, consumer: 'thesis-ledger' };
const identity = { ...envelope, providerId: 'tushare', requestId: 'provider-current' };
const config = {
  ...identity,
  enabled: true,
  configured: true,
  credentialConfigured: true,
  credentialSource: 'control',
  credentialFieldsConfigured: { token: true },
  credentialMethod: 'token',
  configVersion: 1,
  settings: {},
  secretKeyVersion: 'v1',
  updatedAt: '2026-10-02T00:00:00Z',
  effective: null,
};
const probe = {
  ...identity,
  status: 'healthy',
  credentialConfigured: true,
  capabilityResults: {
    DAILY_BAR: { status: 'healthy', readOnly: true, attempted: true, latencyMs: 1 },
  },
};
const removal = {
  ...identity,
  removed: true,
  effective: null,
  tombstone: {
    providerId: 'tushare',
    displayName: 'Tushare',
    reason: 'removed_by_consumer',
    removedAt: config.updatedAt,
  },
};

describe('Provider 当前消费合同', () => {
  for (const [kind, response] of [
    ['config', config],
    ['test', probe],
    ['remove', removal],
  ] as const) {
    it(`${kind} 绑定当前信封、请求及 Provider 身份`, async () => {
      const client = Object.create(DsaClient.prototype) as DsaClient;
      const control = vi.spyOn(client, 'control').mockResolvedValue(response);
      const run = () => {
        const input = { requestId: identity.requestId };
        if (kind === 'config') return client.saveControlProvider('tushare', input);
        if (kind === 'test') return client.testControlProvider('tushare', input);
        return client.removeControlProvider('tushare', input);
      };
      expect(await run()).toEqual(response);
      expect(JSON.parse(control.mock.calls[0]![1]!.body as string)).toMatchObject({
        ...envelope,
        requestId: identity.requestId,
      });
      // Provider 身份属于 URL，不进入写入体。
    });

    it(`${kind} 拒绝旧版本、错配及凭证回显`, async () => {
      const client = Object.create(DsaClient.prototype) as DsaClient;
      const control = vi.spyOn(client, 'control');
      const run = () => {
        const input = { requestId: identity.requestId };
        if (kind === 'config') return client.saveControlProvider('tushare', input);
        if (kind === 'test') return client.testControlProvider('tushare', input);
        return client.removeControlProvider('tushare', input);
      };
      for (const patch of [
        { contractVersion: undefined },
        { contractVersion: 1 },
        { contractVersion: 2 },
        { consumer: 'other' },
        { providerId: 'longbridge' },
        { requestId: 'late-result' },
        { credentials: { token: 'never-return' } },
      ]) {
        control.mockResolvedValue({ ...response, ...patch });
        await expect(run()).rejects.toMatchObject({ code: 'invalid-response' });
      }
    });
  }

  it('Registry 拒绝旧信封和重复 Provider，清除嵌套凭证', async () => {
    const client = Object.create(DsaClient.prototype) as DsaClient;
    const provider = {
      providerId: 'tushare',
      displayName: 'Tushare',
      version: 1,
      capabilities: {},
      configured: true,
      enabled: true,
      credentialConfigured: true,
      token: 'never-return',
    };
    const control = vi
      .spyOn(client, 'control')
      .mockResolvedValue({ ...envelope, providers: [provider] });
    const result = await client.controlProviders();
    expect(JSON.stringify(result)).not.toContain('never-return');
    for (const raw of [
      { providers: [] },
      { ...envelope, contractVersion: 2, providers: [] },
      { ...envelope, providers: [provider, provider] },
    ]) {
      control.mockResolvedValue(raw);
      await expect(client.controlProviders()).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });
});
