import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../../src/identity/identity.service.js';
import { hashIdentityPassword, verifyIdentityPassword } from '../../src/identity/identity-credentials.js';

function setup() {
  type User = { id: string; username: string; displayName: string; passwordHash: string; enabled: boolean };
  type Session = { tokenDigest: string; userId: string; expiresAt: Date; revokedAt: Date | null };
  const users = new Map<string, User>();
  const sessions = new Map<string, Session>();
  const database = {
    identityUser: {
      create: vi.fn(async ({ data }: { data: Omit<User, 'id' | 'enabled'> }) => {
        const user = { ...data, id: randomUUID(), enabled: true }; users.set(user.username, user); return user;
      }),
      findUnique: vi.fn(async ({ where }: { where: { username: string } }) => users.get(where.username) ?? null),
    },
    identitySession: {
      create: vi.fn(async ({ data }: { data: Omit<Session, 'revokedAt'> }) => {
        sessions.set(data.tokenDigest, { ...data, revokedAt: null });
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenDigest: string } }) => {
        const session = sessions.get(where.tokenDigest);
        if (!session) return null;
        return { ...session, user: [...users.values()].find((user) => user.id === session.userId)! };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { tokenDigest: string }; data: { revokedAt: Date } }) => {
        const session = sessions.get(where.tokenDigest); if (session) session.revokedAt = data.revokedAt;
      }),
    },
  };
  return { service: new IdentityService(database as never), database, users, sessions };
}
const credentials = { username: 'test.person', password: 'an-isolated-test-password' };
describe('可信用户会话', () => {
  it('只有密码验证后产生同一用户身份，响应不泄露存储凭据', async () => {
    const { service, users, sessions } = setup();
    const created = await service.register({ ...credentials, username: 'Test.Person', displayName: '测试用户' });
    const login = await service.login(credentials);
    expect(login.principal).toEqual(created.principal);
    expect(login.token).not.toBe(created.token);
    expect(await service.requireSession(login.token)).toEqual(created.principal);
    expect(users.get(credentials.username)?.passwordHash).not.toContain(credentials.password);
    expect(JSON.stringify(created)).not.toMatch(/passwordHash|tokenDigest|an-isolated-test-password/u);
    expect([...sessions.keys()]).not.toContain(login.token);
    await expect(service.requireSession(created.principal.id)).rejects.toMatchObject({ status: 401 });
  });
  it('不存在和错密码使用相同拒绝，不接受自报 owner', async () => {
    const { service } = setup();
    await service.register({ ...credentials, displayName: '测试用户' });
    const wrong = await service.login({ ...credentials, password: 'another-wrong-password' }).catch((error: unknown) => error);
    const missing = await service.login({ ...credentials, username: 'missing.person' }).catch((error: unknown) => error);
    expect(wrong).toMatchObject({ response: { code: 'IDENTITY_UNAUTHORIZED' }, status: 401 });
    expect(missing).toMatchObject({ response: { code: 'IDENTITY_UNAUTHORIZED' }, status: 401 });
    await expect(service.register({ ...credentials, displayName: '越权', ownerId: 'forged' })).rejects.toThrow();
  });
  it('过期、撤销、禁用与缺少会话均被拒绝', async () => {
    const { service, users, sessions } = setup();
    const first = await service.register({ ...credentials, displayName: '测试用户' });
    sessions.values().next().value!.expiresAt = new Date(0);
    await expect(service.requireSession(first.token)).rejects.toMatchObject({ status: 401 });
    const second = await service.login(credentials);
    await service.revoke(second.token);
    await expect(service.requireSession(second.token)).rejects.toMatchObject({ status: 401 });
    const third = await service.login(credentials);
    users.get(credentials.username)!.enabled = false;
    await expect(service.requireSession(third.token)).rejects.toMatchObject({ status: 401 });
    await expect(service.requireSession(undefined)).rejects.toMatchObject({ status: 401 });
  });
  it('随机盐隔离同密码，错误密码和破损散列不会认证成功', async () => {
    const first = await hashIdentityPassword(credentials.password);
    const second = await hashIdentityPassword(credentials.password);
    expect(first).not.toBe(second);
    expect(await verifyIdentityPassword(credentials.password, first)).toBe(true);
    expect(await verifyIdentityPassword('another-wrong-password', first)).toBe(false);
    expect(await verifyIdentityPassword(credentials.password, 'broken')).toBe(false);
  });
});
