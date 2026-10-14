import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authoringStrategySchema } from '@thesis-ledger/schemas';
import { AuthoringDraftRepository } from '../../src/strategy-authoring/authoring-draft.repository.js';
import { AuthoringOperationRepository } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { AuthoringProvenanceRepository } from '../../src/strategy-authoring/authoring-provenance.repository.js';
import {
  isolatedContainer,
  fixtureAppRole,
  fixtureDatabase,
  fixtureClient,
  migrateFixture,
  ownerSql,
  legacyStrategy,
  legacyVersion,
} from './postgres.fixture.js';

const enabled =
  process.env.AUTHORING_ISOLATED === '1' &&
  process.env.NL_AUTHORING_TEST_CONTAINER === isolatedContainer;
const db = enabled ? fixtureClient() : null;
const drafts = db ? new AuthoringDraftRepository(db) : null!;
const operations = db ? new AuthoringOperationRepository(db) : null!;
const provenance = db ? new AuthoringProvenanceRepository(db) : null!;
const definitionText = readFileSync(
  new URL(
    '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
    import.meta.url,
  ),
  'utf8',
);
const content = (valid = false) => ({
  title: '并发验证',
  description: '用户明确输入',
  questions: [
    {
      id: 'sizing',
      basedOnRevision: 1,
      quote: '一半仓位',
      reason: '确认单位',
      options: [],
      dependsOn: [],
      answer: '50%',
      answerState: 'confirmed',
    },
  ],
  requirements: [
    {
      id: 'entry',
      quote: '上穿均线',
      interpretation: '20 根 K 线',
      state: 'understood',
      definitionPaths: ['entry'],
    },
  ],
  runtimeIntents: ['最近三年'],
  removedRequirements: [],
  definitionText: valid ? definitionText : '{',
  manualChanges: [],
});
const cost = {
  status: 'unknown',
  amount: null,
  currency: null,
  source: null,
  pricingVersion: null,
};
const operationInput = (revision: number, key = randomUUID(), kind = 'analyze') => ({
  kind,
  expectedRevision: revision,
  idempotencyKey: key,
  providerId: 'fixture-provider',
  model: 'fixture-model',
  promptVersion: 'nl-v1',
  capabilityVersion: 'authoring-v1',
  cost,
  unknownCostAcknowledgedAt: '2026-10-04T01:00:00Z',
  intent: '',
});
const finishInput = (attempt: number) => ({
  attempt,
  status: 'succeeded',
  externalResult: 'received',
  outputText: '{}',
  errorCode: null,
  usage: null,
  cost,
});

(enabled ? describe : describe.skip)('自然语言编写专用 PostgreSQL 集成', () => {
  beforeAll(async () => {
    await migrateFixture();
    await db!.$connect();
  }, 60_000);
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('全部迁移、head、预期表与受限权限通过，旧记录保持原值', async () => {
    const structure = await migrateFixture();
    expect(ownerSql('SELECT version FROM "SchemaVersion" WHERE id=1')).toBe(structure.currentHead);
    const [identity] = await db!.$queryRaw<
      { current_user: string; current_database: string }[]
    >`SELECT current_user, current_database()`;
    expect(identity).toEqual({
      current_user: fixtureAppRole,
      current_database: fixtureDatabase,
    });
    expect(
      ownerSql(`SELECT name, "schemaVersion" FROM "Strategy" WHERE id='${legacyStrategy}'`),
    ).toBe('保留的旧策略|1');
    expect(
      ownerSql(
        `SELECT schema->>'original', "schemaVersion" FROM "StrategyVersion" WHERE id='${legacyVersion}'`,
      ),
    ).toBe('保留原值|1');
    await expect(db!.$executeRaw`UPDATE "SchemaVersion" SET version='forbidden'`).rejects.toThrow();
  });
  it('不完整定义、澄清答案和运行意图可恢复，但不能冒充有效定义', async () => {
    const created = await drafts.create('alice', content());
    const restored = await drafts.read('alice', created.id);
    expect(restored.content).toEqual(content());
    expect(restored.validation.status).toBe('invalid');
    const changed = await drafts.update('alice', created.id, {
      expectedRevision: 1,
      content: content(true),
    });
    expect(changed.validation.status).toBe('structurally_valid');
    expect(
      ownerSql(`SELECT count(*) FROM "StrategyAuthoringRevision" WHERE "draftId"='${created.id}'`),
    ).toBe('2');
  });
  it('同修订两个真实连接并发写入只有一个成功，另一方返回当前修订', async () => {
    const draft = await drafts.create('alice', content());
    const results = await Promise.allSettled([
      drafts.update('alice', draft.id, {
        expectedRevision: 1,
        content: { ...content(), title: '窗口一' },
      }),
      drafts.update('alice', draft.id, {
        expectedRevision: 1,
        content: { ...content(), title: '窗口二' },
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({
      response: { code: 'AUTHORING_REVISION_CONFLICT', currentRevision: 2 },
    });
    expect((await drafts.read('alice', draft.id)).revision).toBe(2);
  });
  it('同一毫秒内的微秒时间与同一时刻的 UUID 边界不会漏页', async () => {
    const owner = `cursor-owner-${randomUUID()}`;
    const records = await Promise.all(
      Array.from({ length: 4 }, () => drafts.create(owner, content())),
    );
    const fractions = ['900', '500', '100', '100'];
    for (let index = 0; index < records.length; index += 1)
      await db!.$executeRaw`UPDATE "StrategyAuthoringDraft"
        SET "updatedAt" = ${`2026-10-04T01:02:03.123${fractions[index]}Z`}::timestamptz
        WHERE id = ${records[index]!.id}::uuid`;
    const expected = [
      records[0]!.id,
      records[1]!.id,
      ...records
        .slice(2)
        .map((record) => record.id)
        .sort()
        .reverse(),
    ];
    const actual: string[] = [];
    let before: { updatedAt: string; id: string } | undefined;
    for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
      const page = await drafts.list(owner, { limit: 1, ...(before ? { before } : {}) });
      actual.push(...page.items.map((item) => item.id));
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).not.toHaveProperty('cursorUpdatedAt');
      if (pageIndex === 0) expect(page.nextCursor!.updatedAt).toBe('2026-10-04T01:02:03.123900Z');
      if (pageIndex === 3) expect(page.nextCursor).toBeNull();
      before = page.nextCursor ?? undefined;
    }
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(4);
  });

  it('跨 owner 读取、更新、丢弃均拒绝，分页不会泄露他人草稿', async () => {
    const draft = await drafts.create('private-owner', content());
    await Promise.all(
      [
        drafts.read('bob', draft.id),
        drafts.update('bob', draft.id, { expectedRevision: 1, content: content() }),
        drafts.discard('bob', draft.id, 1),
      ].map((work) =>
        expect(work).rejects.toMatchObject({ response: { code: 'AUTHORING_NOT_FOUND' } }),
      ),
    );
    const pageOwner = `page-${randomUUID()}`;
    await drafts.create(pageOwner, content());
    await drafts.create(pageOwner, content());
    const page = await drafts.list(pageOwner, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.ownerId).toBe(pageOwner);
    expect(page.nextCursor).not.toBeNull();
    const next = await drafts.list(pageOwner, { limit: 1, before: page.nextCursor! });
    expect(next.items[0]!.id).not.toBe(page.items[0]!.id);
    expect(next.nextCursor).toBeNull();
  });
  it('丢弃后不可写入或提交新操作', async () => {
    const draft = await drafts.create('alice', content());
    await drafts.discard('alice', draft.id, 1);
    await expect(
      drafts.update('alice', draft.id, { expectedRevision: 1, content: content() }),
    ).rejects.toMatchObject({ response: { code: 'AUTHORING_CLOSED' } });
    await expect(operations.submit('alice', draft.id, operationInput(1))).rejects.toMatchObject({
      response: { code: 'AUTHORING_CLOSED' },
    });
  });
  it('同意图并发只创建一个操作；更改选定模型和第二个活动意图被拒', async () => {
    const draft = await drafts.create('alice', content());
    const input = operationInput(1);
    const [a, b] = await Promise.all([
      operations.submit('alice', draft.id, input),
      operations.submit('alice', draft.id, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.input.selection.model).toBe('fixture-model');
    await expect(
      operations.submit('alice', draft.id, { ...input, model: 'changed' }),
    ).rejects.toMatchObject({ response: { code: 'AUTHORING_IDEMPOTENCY_CONFLICT' } });
    await expect(operations.submit('alice', draft.id, operationInput(1))).rejects.toMatchObject({
      response: { code: 'AUTHORING_OPERATION_ACTIVE' },
    });
  });
  it('只有一个领取成功；越权和错误 attempt 不能提交终态', async () => {
    const draft = await drafts.create('alice', content());
    const operation = await operations.submit('alice', draft.id, operationInput(1));
    const results = await Promise.allSettled([
      operations.claim('alice', operation.id),
      operations.claim('alice', operation.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(operations.read('bob', operation.id)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(operations.finish('bob', operation.id, finishInput(1))).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(operations.finish('alice', operation.id, finishInput(2))).rejects.toMatchObject({
      response: { code: 'AUTHORING_OPERATION_CONFLICT' },
    });
    const finished = await operations.finish('alice', operation.id, finishInput(1));
    expect(finished.outcome!.cost).toEqual(cost);
    await expect(operations.finish('alice', operation.id, finishInput(1))).rejects.toMatchObject({
      response: { code: 'AUTHORING_OPERATION_CONFLICT' },
    });
  });
  it('手动修改或丢弃后的晚到结果仅保留审计，不改变草稿', async () => {
    for (const close of [false, true]) {
      const draft = await drafts.create('alice', content());
      const operation = await operations.submit('alice', draft.id, operationInput(1));
      await operations.claim('alice', operation.id);
      if (close) await drafts.discard('alice', draft.id, 1);
      else
        await drafts.update('alice', draft.id, {
          expectedRevision: 1,
          content: { ...content(), description: '手动修订' },
        });
      const before = await drafts.read('alice', draft.id);
      const finished = await operations.finish('alice', operation.id, finishInput(1));
      expect(finished.status).toBe('succeeded');
      expect(finished.disposition).toBe('stale');
      expect(await drafts.read('alice', draft.id)).toEqual(before);
    }
  });
  it('租约失效时拒绝晚到终态，结果未知和失败费用不会归零', async () => {
    const draft = await drafts.create('alice', content());
    const operation = await operations.submit('alice', draft.id, operationInput(1));
    await operations.claim('alice', operation.id);
    await db!
      .$executeRaw`UPDATE "StrategyAuthoringOperation" SET "leaseUntil"=now()-interval '1 second'
      WHERE id=${operation.id}::uuid`;
    await expect(operations.finish('alice', operation.id, finishInput(1))).rejects.toMatchObject({
      response: { code: 'AUTHORING_OPERATION_CONFLICT' },
    });
    const secondDraft = await drafts.create('alice', content());
    const second = await operations.submit('alice', secondDraft.id, operationInput(1));
    await operations.claim('alice', second.id);
    const failed = await operations.finish('alice', second.id, {
      ...finishInput(1),
      status: 'failed',
      externalResult: 'unknown',
      outputText: null,
      errorCode: 'PROVIDER_RESULT_UNKNOWN',
    });
    expect(failed.outcome!.cost.amount).toBeNull();
    expect(failed.outcome!.externalResult).toBe('unknown');
  });
  it('提案绑定定义和修订，读取可识别过期且他人不能处理', async () => {
    const draft = await drafts.create('alice', content(true));
    const operation = await operations.submit(
      'alice',
      draft.id,
      operationInput(1, randomUUID(), 'modify'),
    );
    await operations.claim('alice', operation.id);
    await operations.finish('alice', operation.id, finishInput(1));
    const after = authoringStrategySchema.parse(definitionText);
    after.risk = [{ type: 'fixedStop', percent: '0.06' }];
    const proposal = await provenance.propose('alice', draft.id, {
      operationId: operation.id,
      expectedRevision: 1,
      intent: '止损改为 6%',
      allowedPaths: ['risk.0.percent'],
      beforeText: definitionText,
      afterText: JSON.stringify(after),
      differences: [{ path: 'risk.0.percent', before: '0.05', after: '0.06' }],
    });
    expect(proposal.status).toBe('pending');
    await expect(provenance.readProposal('bob', proposal.id)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(provenance.discardProposal('bob', proposal.id, 1)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await drafts.update('alice', draft.id, {
      expectedRevision: 1,
      content: { ...content(true), title: '新版' },
    });
    expect((await provenance.readProposal('alice', proposal.id)).status).toBe('expired');
    await expect(provenance.discardProposal('alice', proposal.id, 1)).rejects.toMatchObject({
      response: { code: 'AUTHORING_REVISION_CONFLICT' },
    });
  });
  it('同事务固定版本来源、重试不改变快照；已保存不可继续写入', async () => {
    const draft = await drafts.create('alice', content(true));
    const operation = await operations.submit(
      'alice',
      draft.id,
      operationInput(1, randomUUID(), 'generate'),
    );
    await operations.claim('alice', operation.id);
    await operations.finish('alice', operation.id, finishInput(1));
    // 本叶模拟已确认应用的生成事实；真实应用流程由执行集成验证。
    await db!
      .$executeRaw`UPDATE "StrategyAuthoringOperation" SET disposition='applied' WHERE id=${operation.id}::uuid`;
    const schema = authoringStrategySchema.parse(definitionText);
    const versionId = await db!.$transaction(async (tx) => {
      const strategy = await tx.strategy.create({
        data: {
          name: '隔离来源样本',
          schemaVersion: 2,
          versions: {
            create: { version: 1, schemaVersion: 2, schema: schema as Prisma.InputJsonValue },
          },
        },
        include: { versions: true },
      });
      const version = strategy.versions[0]!;
      await tx.$executeRaw`UPDATE "StrategyAuthoringDraft" SET state='saved', "savedVersionId"=${version.id}::uuid WHERE id=${draft.id}::uuid`;
      await provenance.recordSource(tx, 'alice', draft.id, version.id, 1);
      return version.id;
    });
    const source = await provenance.readSource('alice', versionId);
    expect(source.snapshot.operationIds).toEqual([operation.id]);
    expect(source.snapshot.content).toEqual(content(true));
    await db!.$transaction((tx) => provenance.recordSource(tx, 'alice', draft.id, versionId, 1));
    expect(await provenance.readSource('alice', versionId)).toEqual(source);
    await expect(provenance.readSource('bob', versionId)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(
      drafts.update('alice', draft.id, { expectedRevision: 1, content: content() }),
    ).rejects.toMatchObject({ response: { code: 'AUTHORING_CLOSED' } });
    await expect(
      db!.$transaction((tx) => provenance.recordSource(tx, 'bob', draft.id, versionId, 1)),
    ).rejects.toMatchObject({ response: { code: 'AUTHORING_NOT_FOUND' } });
  });
  it('保存期间晚到结果保留调用事实且不能改写已保存草稿', async () => {
    const draft = await drafts.create('alice', content(true));
    const operation = await operations.submit('alice', draft.id, operationInput(1));
    await operations.claim('alice', operation.id);
    await db!.$transaction(async (tx) => {
      const strategy = await tx.strategy.create({
        data: {
          name: '终态竞态样本',
          schemaVersion: 2,
          versions: {
            create: {
              version: 1,
              schemaVersion: 2,
              schema: authoringStrategySchema.parse(definitionText) as Prisma.InputJsonValue,
            },
          },
        },
        include: { versions: true },
      });
      await tx.$executeRaw`UPDATE "StrategyAuthoringDraft" SET state='saved', "savedVersionId"=${strategy.versions[0]!.id}::uuid WHERE id=${draft.id}::uuid`;
    });
    const before = await drafts.read('alice', draft.id);
    const finished = await operations.finish('alice', operation.id, finishInput(1));
    expect(finished.disposition).toBe('stale');
    expect(await drafts.read('alice', draft.id)).toEqual(before);
  });
  it('来源定义与版本不一致时整个外部事务回滚', async () => {
    const draft = await drafts.create('alice', content(true));
    const operation = await operations.submit(
      'alice',
      draft.id,
      operationInput(1, randomUUID(), 'generate'),
    );
    await operations.claim('alice', operation.id);
    await operations.finish('alice', operation.id, finishInput(1));
    const count = await db!.strategy.count();
    const wrong = { ...authoringStrategySchema.parse(definitionText), name: '与来源不同' };
    await expect(
      db!.$transaction(async (tx) => {
        const strategy = await tx.strategy.create({
          data: {
            name: '应回滚',
            schemaVersion: 2,
            versions: {
              create: { version: 1, schemaVersion: 2, schema: wrong as Prisma.InputJsonValue },
            },
          },
          include: { versions: true },
        });
        const versionId = strategy.versions[0]!.id;
        await tx.$executeRaw`UPDATE "StrategyAuthoringDraft" SET state='saved', "savedVersionId"=${versionId}::uuid WHERE id=${draft.id}::uuid`;
        await provenance.recordSource(tx, 'alice', draft.id, versionId, 1);
      }),
    ).rejects.toMatchObject({ response: { code: 'AUTHORING_REVISION_CONFLICT' } });
    expect(await db!.strategy.count()).toBe(count);
    expect((await drafts.read('alice', draft.id)).state).toBe('editing');
  });
});
