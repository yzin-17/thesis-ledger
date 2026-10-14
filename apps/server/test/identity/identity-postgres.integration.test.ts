import 'reflect-metadata';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IdentityService } from '../../src/identity/identity.service.js';
import type * as IdentityRuntime from '../../src/identity/identity.module.js';
import type * as AuthoringRuntime from '../../src/strategy-authoring/strategy-authoring.module.js';
import type * as PersistenceRuntime from '../../src/platform/prisma.service.js';
import type * as FilterRuntime from '../../src/platform/api-exception.filter.js';
import type * as SecurityRuntime from '../../src/platform/network-security.js';
import type * as InvocationRuntime from '../../src/ai/ai-invocation.store.js';
import type * as DraftRuntime from '../../src/strategy-authoring/authoring-draft.repository.js';
import type * as OperationRuntime from '../../src/strategy-authoring/authoring-operation.repository.js';

const enabled = process.env.IDENTITY_ISOLATED === '1';
describe.skipIf(!enabled)('隔离 PostgreSQL 与真实双用户 HTTP', () => {
  let db: PrismaClient;
  let app: INestApplication;
  let base: string;
  const gateway = 'isolated-shared-gateway-token';
  const password = randomBytes(24).toString('base64url');
  const blank = {
    title: '隔离验收草稿',
    description: '均线趋势测试',
    questions: [],
    requirements: [],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
  };
  type Session = Awaited<ReturnType<IdentityService['register']>>;
  let alice: Session;
  let bob: Session;
  let aliceDraft: string;
  const load = async <T>(file: string): Promise<T> =>
    import(pathToFileURL(resolve('dist/src', file)).href) as Promise<T>;
  async function request(
    path: string,
    status: number,
    body?: unknown,
    token?: string,
    method?: string,
  ) {
    const response = await fetch(`${base}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        authorization: `Bearer ${gateway}`,
        'content-type': 'application/json',
        ...(token ? { 'x-thesis-ledger-session': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.status, `${path} 状态`).toBe(status);
    return response.status === 204 ? null : ((await response.json()) as Record<string, unknown>);
  }
  beforeAll(async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const original = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL!);
    if (original.hostname !== '127.0.0.1' || original.pathname !== '/journal_review_fixture')
      throw new Error('只允许仓库入口新建的隔离数据库');
    original.username = 'fixture_app';
    db = new PrismaClient({ datasourceUrl: original.toString() });
    await db.$connect();
    const [identity, authoring, platform, filter, security] = await Promise.all([
      load<typeof IdentityRuntime>('identity/identity.module.js'),
      load<typeof AuthoringRuntime>('strategy-authoring/strategy-authoring.module.js'),
      load<typeof PersistenceRuntime>('platform/prisma.service.js'),
      load<typeof FilterRuntime>('platform/api-exception.filter.js'),
      load<typeof SecurityRuntime>('platform/network-security.js'),
    ]);
    class FixturePersistence {}
    Global()(FixturePersistence);
    Module({
      providers: [{ provide: platform.PrismaService, useValue: db }],
      exports: [platform.PrismaService],
    })(FixturePersistence);
    class FixtureApplication {}
    Module({
      imports: [FixturePersistence, identity.IdentityModule, authoring.StrategyAuthoringModule],
    })(FixtureApplication);
    app = await NestFactory.create(FixtureApplication, { logger: false });
    const createGateway = security.createLanAuthMiddleware as (
      token: string,
    ) => Parameters<INestApplication['use']>[0];
    app.use(createGateway(gateway));
    const Filter = filter.ApiExceptionFilter as new () => Parameters<
      INestApplication['useGlobalFilters']
    >[0];
    app.useGlobalFilters(new Filter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    vi.unstubAllEnvs();
  });

  it('实际密码登录与数据库唯一约束，响应不泄露散列且只存会话摘要', async () => {
    alice = (await request('/identity/users', 201, {
      username: 'Alice.Fixture',
      password,
      displayName: '用户甲',
    })) as unknown as Session;
    bob = (await request('/identity/users', 201, {
      username: 'bob.fixture',
      password,
      displayName: '用户乙',
    })) as unknown as Session;
    await request('/identity/users', 409, {
      username: 'alice.fixture',
      password,
      displayName: '重复用户',
    });
    const logged = (await request('/identity/sessions', 200, {
      username: 'ALICE.FIXTURE',
      password,
    })) as unknown as Session;
    expect(logged.principal).toEqual(alice.principal);
    const absent = await request('/identity/sessions', 401, {
      username: 'missing.fixture',
      password,
    });
    const wrong = await request('/identity/sessions', 401, {
      username: 'alice.fixture',
      password: 'another-wrong-password',
    });
    expect(absent).toEqual(wrong);
    expect(JSON.stringify(alice)).not.toMatch(/passwordHash|tokenDigest/u);
    const user = await db.identityUser.findUniqueOrThrow({ where: { id: alice.principal.id } });
    expect(user.passwordHash).not.toContain(password);
    expect(user.passwordHash).toMatch(/^scrypt-v1:/u);
    const session = await db.identitySession.findUniqueOrThrow({
      where: { tokenDigest: createHash('sha256').update(alice.token).digest('hex') },
    });
    expect(session.userId).toBe(alice.principal.id);
    expect(session.tokenDigest).not.toBe(alice.token);
  });
  it('共享网关不能代替用户，跨用户草稿和 owner 注入全部被拒绝', async () => {
    await request('/strategy-authoring/drafts', 401, blank);
    await request('/strategy-authoring/drafts', 401, blank, alice.principal.id);
    await request(
      '/strategy-authoring/drafts',
      400,
      { ...blank, ownerId: bob.principal.id },
      alice.token,
    );
    const created = await request('/strategy-authoring/drafts', 201, blank, alice.token);
    aliceDraft = created!.id as string;
    await request('/strategy-authoring/drafts', 201, { ...blank, title: '甲第二项' }, alice.token);
    await request('/strategy-authoring/drafts', 201, { ...blank, title: '乙独立草稿' }, bob.token);
    await request(`/strategy-authoring/drafts/${aliceDraft}`, 404, undefined, bob.token);
    await request(
      `/strategy-authoring/drafts/${aliceDraft}`,
      404,
      { expectedRevision: 1, content: blank },
      bob.token,
      'PATCH',
    );
    await request(
      `/strategy-authoring/drafts/${aliceDraft}/discard`,
      404,
      { expectedRevision: 1 },
      bob.token,
    );
    const listed = await request('/strategy-authoring/drafts', 200, undefined, bob.token);
    expect(
      (listed!.items as Array<{ ownerId: string; id: string }>).every(
        (item) => item.ownerId === bob.principal.id && item.id !== aliceDraft,
      ),
    ).toBe(true);
    await request(
      `/strategy-authoring/drafts?ownerId=${alice.principal.id}`,
      400,
      undefined,
      bob.token,
    );
    const page = await request('/strategy-authoring/drafts?limit=1', 200, undefined, alice.token);
    expect(page!.items).toHaveLength(1);
    const cursor = page!.nextCursor as { id: string; updatedAt: string };
    expect(cursor).not.toBeNull();
    const next = await request(
      `/strategy-authoring/drafts?limit=1&beforeId=${cursor.id}&beforeUpdatedAt=${encodeURIComponent(cursor.updatedAt)}`,
      200,
      undefined,
      alice.token,
    );
    expect(next!.items).toHaveLength(1);
    expect((next!.items as Array<{ id: string }>)[0]!.id).not.toBe(
      (page!.items as Array<{ id: string }>)[0]!.id,
    );
  });
  it('修订与关闭状态保持，过期、撤销、禁用用户不会继续访问', async () => {
    await request(
      `/strategy-authoring/drafts/${aliceDraft}`,
      200,
      { expectedRevision: 1, content: { ...blank, title: '新修订' } },
      alice.token,
      'PATCH',
    );
    await request(
      `/strategy-authoring/drafts/${aliceDraft}`,
      409,
      { expectedRevision: 1, content: blank },
      alice.token,
      'PATCH',
    );
    await request(
      `/strategy-authoring/drafts/${aliceDraft}/discard`,
      201,
      { expectedRevision: 2 },
      alice.token,
    );
    await request(
      `/strategy-authoring/drafts/${aliceDraft}`,
      409,
      { expectedRevision: 2, content: blank },
      alice.token,
      'PATCH',
    );
    await request('/identity/session/revoke', 204, {}, alice.token);
    await request(`/strategy-authoring/drafts/${aliceDraft}`, 401, undefined, alice.token);
    const restored = (await request('/identity/sessions', 200, {
      username: 'alice.fixture',
      password,
    })) as unknown as Session;
    expect(
      (await request(`/strategy-authoring/drafts/${aliceDraft}`, 200, undefined, restored.token))!
        .state,
    ).toBe('discarded');
    await db.identitySession.update({
      where: { tokenDigest: createHash('sha256').update(restored.token).digest('hex') },
      data: { expiresAt: new Date(0) },
    });
    await request('/identity/session', 401, undefined, restored.token);
    await db.identityUser.update({ where: { id: bob.principal.id }, data: { enabled: false } });
    await request('/identity/session', 401, undefined, bob.token);
    const privileges = await db.$queryRaw<
      Array<{ superuser: boolean; createdb: boolean }>
    >`SELECT rolsuper AS superuser, rolcreatedb AS createdb FROM pg_roles WHERE rolname=current_user`;
    expect(privileges).toEqual([{ superuser: false, createdb: false }]);
  });
  it('真实业务租约失效后仍保留独立调用事实、未知与晚到结果，不重写历史', async () => {
    const [{ AiInvocationStore }, { AuthoringDraftRepository }, { AuthoringOperationRepository }] =
      await Promise.all([
        load<typeof InvocationRuntime>('ai/ai-invocation.store.js'),
        load<typeof DraftRuntime>('strategy-authoring/authoring-draft.repository.js'),
        load<typeof OperationRuntime>('strategy-authoring/authoring-operation.repository.js'),
      ]);
    const audit = new AiInvocationStore(db as never);
    const drafts = new AuthoringDraftRepository(db);
    const operations = new AuthoringOperationRepository(db);
    const draft = await drafts.create(alice.principal.id, blank);
    const cost = {
      status: 'unknown',
      amount: null,
      currency: null,
      source: null,
      pricingVersion: null,
    };
    const operation = await operations.submit(alice.principal.id, draft.id, {
      kind: 'analyze',
      expectedRevision: 1,
      idempotencyKey: 'isolated-audit',
      providerId: 'selected',
      model: 'chosen',
      promptVersion: 'nl-v1',
      capabilityVersion: 'authoring-v1',
      cost,
      unknownCostAcknowledgedAt: new Date().toISOString(),
      intent: '',
    });
    const claimed = await operations.claim(alice.principal.id, operation.id);
    const preparation = {
      requestId: randomUUID(),
      consumer: 'strategy_authoring',
      referenceId: operation.id,
      ownerId: alice.principal.id,
      executionAttempt: claimed.attempt,
      providerId: 'selected',
      requestedModel: 'chosen',
      inputFingerprint: 'a'.repeat(64),
    };
    await Promise.all([audit.prepare(preparation), audit.prepare(preparation)]);
    await expect(
      audit.prepare({ ...preparation, requestId: randomUUID(), requestedModel: 'different' }),
    ).rejects.toMatchObject({ status: 409 });
    const dispatch = {
      eventKey: randomUUID(),
      kind: 'dispatching',
      actualModel: null,
      usage: null,
      cost,
      errorCode: null,
      outputFingerprint: null,
    };
    await Promise.all([
      audit.append(preparation.requestId, dispatch),
      audit.append(preparation.requestId, dispatch),
    ]);
    await db.$executeRaw`UPDATE "StrategyAuthoringOperation" SET "leaseUntil"=TIMESTAMP '2000-01-01' WHERE id=${operation.id}::uuid`;
    await audit.append(preparation.requestId, {
      ...dispatch,
      eventKey: randomUUID(),
      kind: 'unknown',
      errorCode: 'result_unknown',
    });
    const received = {
      ...dispatch,
      eventKey: randomUUID(),
      kind: 'received',
      actualModel: 'chosen',
      usage: { status: 'reported', inputTokens: 12, outputTokens: 24 },
      outputFingerprint: 'b'.repeat(64),
    };
    await audit.append(preparation.requestId, received);
    expect(
      await operations.expire(alice.principal.id, operation.id, claimed.attempt + 1),
    ).toBeNull();
    const expired = await operations.expire(alice.principal.id, operation.id, claimed.attempt);
    expect(expired?.status).toBe('failed');
    expect(expired?.outcome?.errorCode).toBe('AUTHORING_RESULT_UNKNOWN');
    await expect(
      operations.finish(alice.principal.id, operation.id, {
        attempt: claimed.attempt,
        status: 'succeeded',
        externalResult: 'received',
        outputText: '{}',
        errorCode: null,
        usage: received.usage,
        cost,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      audit.append(preparation.requestId, { ...received, actualModel: 'overwritten' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      audit.append(preparation.requestId, { ...dispatch, eventKey: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    const stored = await audit.read(alice.principal.id, preparation.requestId);
    expect(stored!.facts.map((fact) => fact.kind)).toEqual(['dispatching', 'unknown', 'received']);
    expect(stored!.facts.map((fact) => fact.sequence)).toEqual([1, 2, 3]);
    expect((stored!.facts[2]!.details as { cost: unknown }).cost).toEqual(cost);
    expect(await audit.read(bob.principal.id, preparation.requestId)).toBeNull();
    expect(await db.aiInvocation.count({ where: { referenceId: operation.id } })).toBe(1);
  });
  it('实际并发领取一个成功，续租有总期限，排队和在途取消均收敛', async () => {
    const [{ AuthoringDraftRepository }, { AuthoringOperationRepository }] = await Promise.all([
      load<typeof DraftRuntime>('strategy-authoring/authoring-draft.repository.js'),
      load<typeof OperationRuntime>('strategy-authoring/authoring-operation.repository.js'),
    ]);
    const drafts = new AuthoringDraftRepository(db);
    const operations = new AuthoringOperationRepository(db);
    const draft = await drafts.create(alice.principal.id, blank);
    const cost = {
      status: 'unknown',
      amount: null,
      currency: null,
      source: null,
      pricingVersion: null,
    };
    const selection = {
      kind: 'analyze',
      expectedRevision: 1,
      providerId: 'selected',
      model: 'chosen',
      promptVersion: 'nl-v1',
      capabilityVersion: 'authoring-v1',
      cost,
      unknownCostAcknowledgedAt: new Date().toISOString(),
      intent: '',
    };
    const queued = await operations.submit(alice.principal.id, draft.id, {
      ...selection,
      idempotencyKey: 'queued-cancel',
    });
    await expect(operations.cancel(bob.principal.id, queued.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await operations.cancel(alice.principal.id, queued.id)).status).toBe('cancelled');
    expect((await operations.cancel(alice.principal.id, queued.id)).attempt).toBe(0);
    await expect(operations.claim(alice.principal.id, queued.id)).rejects.toMatchObject({
      status: 409,
    });
    const submitted = await operations.submit(alice.principal.id, draft.id, {
      ...selection,
      idempotencyKey: 'running-cancel',
    });
    const claimed = await Promise.allSettled([
      operations.claim(alice.principal.id, submitted.id),
      operations.claim(alice.principal.id, submitted.id),
    ]);
    expect(claimed.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const running = await operations.read(alice.principal.id, submitted.id);
    expect(running.attempt).toBe(1);
    expect(await operations.renew(alice.principal.id, running.id, 2)).toBeNull();
    const renewed = await operations.renew(alice.principal.id, running.id, 1);
    expect(renewed!.leaseUntil!.getTime()).toBeLessThanOrEqual(
      renewed!.startedAt!.getTime() + 120_000,
    );
    expect(await operations.expire(alice.principal.id, running.id, 1)).toBeNull();
    await operations.cancel(alice.principal.id, running.id);
    expect(await operations.renew(alice.principal.id, running.id, 1)).toBeNull();
    await expect(
      operations.finish(alice.principal.id, running.id, {
        attempt: 1,
        status: 'succeeded',
        externalResult: 'received',
        outputText: '{}',
        errorCode: null,
        usage: null,
        cost,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const cancelled = await operations.finish(alice.principal.id, running.id, {
      attempt: 1,
      status: 'cancelled',
      externalResult: 'not_sent',
      outputText: null,
      errorCode: 'AUTHORING_CANCELLED',
      usage: null,
      cost,
    });
    expect(cancelled.status).toBe('cancelled');
    expect((await operations.cancel(alice.principal.id, running.id)).status).toBe('cancelled');
    const deadline = await drafts.create(alice.principal.id, blank);
    const late = await operations.submit(alice.principal.id, deadline.id, {
      ...selection,
      idempotencyKey: 'deadline',
    });
    await operations.claim(alice.principal.id, late.id);
    await db.$executeRaw`UPDATE "StrategyAuthoringOperation" SET "startedAt"=clock_timestamp()-interval '121 seconds' WHERE id=${late.id}::uuid`;
    expect(await operations.renew(alice.principal.id, late.id, 1)).toBeNull();
    await expect(
      operations.finish(alice.principal.id, late.id, {
        attempt: 1,
        status: 'succeeded',
        externalResult: 'received',
        outputText: '{}',
        errorCode: null,
        usage: null,
        cost,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await operations.expire(alice.principal.id, late.id, 1))?.status).toBe('failed');
  });
});
