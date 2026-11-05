import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  createStack,
  databaseUrl,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated = databaseUrl ? describe : describe.skip;

isolated('AI 服务数据库唯一来源：真实 PostgreSQL 与实例重载', () => {
  let first: ProviderStack | undefined;
  let reloaded: ProviderStack | undefined;
  afterAll(async () => {
    await first?.close();
    await reloaded?.close();
    vi.unstubAllEnvs();
  });

  it('保存和编辑保留加密凭证，新实例重载且删除后不会恢复环境记录', async () => {
    const name = 'database-only';
    const credential = 'synthetic-database-only-key';
    vi.stubEnv(
      'AI_PROVIDER_CONFIGS_JSON',
      JSON.stringify([
        {
          id: name,
          baseUrl: 'https://environment.invalid/v1',
          models: ['environment-model'],
          apiKey: 'synthetic-environment-key',
        },
      ]),
    );
    vi.stubEnv('AI_FIXTURE_ENABLED', 'true');
    first = await createStack();
    await reset(first);
    await first.providers.onModuleInit();
    expect(await first.providers.list()).toEqual([]);
    expect(first.registry.list()).toEqual([]);

    const input = {
      ...providerInput(name),
      authMode: 'api_key',
      apiKey: credential,
      enabled: false,
    };
    const created = await first.request('/ai/providers', input);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name,
      source: 'database',
      enabled: false,
      credentialConfigured: true,
    });
    expect(JSON.stringify(created.body)).not.toContain(credential);
    const stored = await first.configs.findStored(name);
    expect(Buffer.from(stored!.encryptedCredentials!).includes(Buffer.from(credential))).toBe(
      false,
    );

    reloaded = await createStack();
    expect(await reloaded.providers.list()).toEqual([
      expect.objectContaining({ name, source: 'database', enabled: false }),
    ]);
    const { apiKey: _credential, ...editInput } = input;
    void _credential;
    const edited = await reloaded.request('/ai/providers', {
      ...editInput,
      priority: 17,
      expectedRevision: stored!.updatedAt.toISOString(),
    });
    expect(edited.status).toBe(201);
    expect(edited.body).toMatchObject({ priority: 17, credentialConfigured: true });
    expect(await reloaded.configs.readCredential((await reloaded.configs.findStored(name))!)).toBe(
      credential,
    );

    // 本段验证 Registry 消费持久化状态；启用前用途验证另由既有保存门禁测试覆盖。
    const current = await first.configs.findStored(name);
    await first.providers.setEnabled(name, true, {
      expectedRevision: current!.updatedAt.toISOString(),
    });
    await reloaded.providers.refreshRegistry();
    expect(reloaded.registry.list()).toEqual([
      expect.objectContaining({ id: name, models: ['model'] }),
    ]);
    const enabled = await first.configs.findStored(name);
    const disabled = await first.request(
      `/ai/providers/${name}/enabled`,
      {
        enabled: false,
        expectedRevision: enabled!.updatedAt.toISOString(),
      },
      'PATCH',
    );
    expect(disabled.status).toBe(200);
    expect(first.registry.list()).toEqual([]);
    const removable = await first.configs.findStored(name);
    const deleted = await first.request(
      `/ai/providers/${name}`,
      {
        expectedRevision: removable!.updatedAt.toISOString(),
      },
      'DELETE',
    );
    expect(deleted.status).toBe(200);
    await reloaded.providers.refreshRegistry();
    expect(await reloaded.providers.list()).toEqual([]);
    expect(reloaded.registry.list()).toEqual([]);
    expect(await first.prisma.providerConfig.count()).toBe(0);
    expect(first.sdk.generate).not.toHaveBeenCalled();
    expect(reloaded.sdk.generate).not.toHaveBeenCalled();
  });
});
