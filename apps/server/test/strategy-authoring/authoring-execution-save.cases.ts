import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { authoringStrategySchema } from '@thesis-ledger/schemas';
import type { AuthoringExecutionCaseContext } from './authoring-execution.case-context.js';

export function registerAuthoringSaveCases(getContext: () => AuthoringExecutionCaseContext) {
  it('目录到生成、审阅、并发保存及来源形成真实纵向闭环，失败完整回滚', async () => {
    const context = getContext();
    const { request, observe, selection, alice, bob, db, blank, instrumentId, sources, access } =
      context;
    const definition = authoringStrategySchema.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const content = {
      ...blank,
      runtimeIntents: ['保存后由用户主动发起回测'],
      requirements: [
        {
          id: 'rule',
          quote: blank.description,
          interpretation: '受控完整需求',
          state: 'understood',
          definitionPaths: [],
        },
      ],
      confirmation: {
        instrumentId,
        instrument: definition.executionInstrument,
        timeframe: definition.primaryTimeframe,
        entrySummary: '收盘价上穿 20 根均线',
        exitSummary: '收盘价下穿 20 根均线',
        sizing: definition.sizing,
        risk: definition.risk,
        noExtraRiskConfirmed: true,
        execution: definition.execution,
        cost: definition.cost,
        periodsAreBarsConfirmed: true,
      },
    };
    const current = await request('/strategy-authoring/drafts', 201, content, alice.token);
    const path = `/strategy-authoring/drafts/${current.id as string}`;
    await request(
      `${path}/operations`,
      400,
      { ...selection('bad-catalog'), kind: 'generate', instrumentId: bob.principal.id },
      alice.token,
    );
    const failedCandidateIds: string[] = [];
    for (const scenario of ['capability', 'semantic'] as const) {
      const beforeCalls = context.providerCalls;
      const candidate =
        scenario === 'capability'
          ? { ...definition, benchmark: definition.executionInstrument }
          : { ...definition, cost: { ...definition.cost, commissionRate: '0.9' } };
      context.output = {
        definition: candidate,
        coverage: [{ requirementId: 'rule', definitionPaths: ['entry', 'exit'] }],
      };
      const rejected = await request(
        `${path}/operations`,
        201,
        { ...selection(`candidate-${scenario}`), kind: 'generate' },
        alice.token,
      );
      failedCandidateIds.push(rejected.id as string);
      const failed = await observe(rejected.id as string);
      expect(failed.status).toBe('failed');
      expect(failed.outcome).toMatchObject({
        externalResult: 'received',
        outputText: JSON.stringify(context.output),
        errorCode:
          scenario === 'capability' ? 'AUTHORING_SCHEMA_INVALID' : 'AUTHORING_SEMANTIC_MISMATCH',
      });
      expect(context.providerCalls).toBe(beforeCalls + 1);
      await request(
        `/strategy-authoring/operations/${rejected.id}/apply-generation`,
        409,
        { expectedRevision: 1 },
        alice.token,
      );
      expect((await request(path, 200, undefined, alice.token)).revision).toBe(1);
    }
    context.output = {
      definition,
      coverage: [{ requirementId: 'rule', definitionPaths: ['entry', 'exit'] }],
    };
    const generated = await request(
      `${path}/operations`,
      201,
      { ...selection('vertical-generate'), kind: 'generate' },
      alice.token,
    );
    expect((await observe(generated.id as string)).status).toBe('succeeded');
    const applyPath = `/strategy-authoring/operations/${generated.id}/apply-generation`;
    await request(applyPath, 404, { expectedRevision: 1 }, bob.token);
    const applied = await Promise.all([
      request(applyPath, 201, { expectedRevision: 1 }, alice.token),
      request(applyPath, 201, { expectedRevision: 1 }, alice.token),
    ]);
    expect(applied[0]).toEqual(applied[1]);
    await request(`${path}/review`, 404, undefined, bob.token);
    const review = await request(`${path}/review`, 200, undefined, alice.token);
    expect(review).toMatchObject({ revision: 2, definition });
    const saveInput = {
      expectedRevision: 2,
      name: '受控保存正式策略',
      reviewedDefinitionHash: review.definitionHash,
    };
    await request(`${path}/save`, 409, { ...saveInput, expectedRevision: 1 }, alice.token);
    await request(
      `${path}/save`,
      409,
      { ...saveInput, reviewedDefinitionHash: '0'.repeat(64) },
      alice.token,
    );
    await request(`${path}/save`, 404, saveInput, bob.token);
    const strategyCount = await db.strategy.count();
    const versionCount = await db.strategyVersion.count();
    const runCount = await db.backtestJob.count();
    const persist = vi
      .spyOn(sources, 'recordSource')
      .mockRejectedValueOnce(new Error('受控来源写入失败'));
    try {
      await request(`${path}/save`, 500, saveInput, alice.token);
    } finally {
      persist.mockRestore();
    }
    expect(await db.strategy.count()).toBe(strategyCount);
    expect(await db.strategyVersion.count()).toBe(versionCount);
    expect((await request(path, 200, undefined, alice.token)).state).toBe('editing');
    const saved = await Promise.all([
      request(`${path}/save`, 201, saveInput, alice.token),
      request(`${path}/save`, 201, saveInput, alice.token),
    ]);
    expect(saved[0]).toEqual(saved[1]);
    expect(saved[0]!.version).toBe(1);
    expect(await request(`${path}/save`, 201, saveInput, alice.token)).toEqual(saved[0]);
    await request(`${path}/save`, 409, { ...saveInput, name: '不能更换保存意图' }, alice.token);
    expect(await db.strategy.count()).toBe(strategyCount + 1);
    expect(await db.strategyVersion.count()).toBe(versionCount + 1);
    expect(await db.backtestJob.count()).toBe(runCount);
    const version = await db.strategyVersion.findUniqueOrThrow({
      where: { id: saved[0]!.versionId as string },
      include: { strategy: true },
    });
    expect(version.strategy.ownerId).toBe(alice.principal.id);
    expect(version.schema).toEqual(definition);
    expect(version.source).toEqual({ kind: 'ai_assisted', referenceId: current.id });
    await access.strategy(version.strategyId, alice.principal.id);
    await expect(access.strategy(version.strategyId, bob.principal.id)).rejects.toThrow('不可访问');
    await expect(access.version(version.id, null)).rejects.toThrow('不可访问');
    const sourcePath = `/strategy-authoring/versions/${version.id}/source`;
    await request(sourcePath, 401);
    await request(sourcePath, 404, undefined, bob.token);
    const source = await request(sourcePath, 200, undefined, alice.token);
    expect(source).toMatchObject({
      revision: 2,
      snapshot: {
        kind: 'ai_assisted',
        operationIds: [...failedCandidateIds, generated.id],
        content: { runtimeIntents: content.runtimeIntents },
      },
    });
    expect((await request(path, 200, undefined, alice.token)).state).toBe('saved');
    await request(path, 409, { expectedRevision: 2, content }, alice.token, 'PATCH');
  });
  it('建议审核、并发应用、放弃和旧修订拒绝均走真实 API', async () => {
    const context = getContext();
    const { request, observe, selection, alice, bob, blank, instrumentId } = context;
    const definition = authoringStrategySchema.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const content = {
      ...blank,
      definitionText: JSON.stringify(definition),
      requirements: [
        {
          id: 'rule',
          quote: blank.description,
          interpretation: '受控需求',
          state: 'understood',
          definitionPaths: ['entry'],
        },
      ],
      confirmation: {
        instrumentId,
        instrument: definition.executionInstrument,
        timeframe: definition.primaryTimeframe,
        entrySummary: '上穿入场',
        exitSummary: '下穿退出',
        sizing: definition.sizing,
        risk: definition.risk,
        noExtraRiskConfirmed: false,
        execution: definition.execution,
        cost: definition.cost,
        periodsAreBarsConfirmed: true,
      },
    };
    for (const disposition of ['apply', 'discard', 'stale'] as const) {
      const draft = await request('/strategy-authoring/drafts', 201, content, alice.token);
      const draftPath = `/strategy-authoring/drafts/${draft.id as string}`;
      context.output = {
        definition: { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }] },
        coverage: [{ requirementId: 'rule', definitionPaths: ['entry'] }],
      };
      const operation = await request(
        `${draftPath}/operations`,
        201,
        {
          ...selection(`modify-${disposition}`),
          kind: 'modify',
          intent: '止损改为 3%，其他不变',
          modificationTarget: 'risk',
        },
        alice.token,
      );
      expect((await observe(operation.id as string)).status).toBe('succeeded');
      const proposalPath = `/strategy-authoring/operations/${operation.id}/proposal`;
      await request(proposalPath, 404, { expectedRevision: 1 }, bob.token);
      await request(
        proposalPath,
        400,
        { expectedRevision: 1, allowedPaths: ['entry'] },
        alice.token,
      );
      const proposals = await Promise.all([
        request(proposalPath, 201, { expectedRevision: 1 }, alice.token),
        request(proposalPath, 201, { expectedRevision: 1 }, alice.token),
      ]);
      expect(proposals[0]!.id).toBe(proposals[1]!.id);
      expect(proposals[0]!.payload).toMatchObject({ allowedPaths: ['risk.0'] });
      const path = `/strategy-authoring/proposals/${proposals[0]!.id as string}`;
      await request(path, 404, undefined, bob.token);
      await request(`${path}/apply`, 404, { expectedRevision: 1 }, bob.token);
      if (disposition === 'apply') {
        const applied = await Promise.all([
          request(`${path}/apply`, 201, { expectedRevision: 1 }, alice.token),
          request(`${path}/apply`, 201, { expectedRevision: 1 }, alice.token),
        ]);
        expect(applied[0]).toEqual(applied[1]);
        const current = await request(draftPath, 200, undefined, alice.token);
        expect(current.revision).toBe(2);
        expect(JSON.parse((current.content as typeof content).definitionText)).toEqual(
          (context.output as { definition: unknown }).definition,
        );
        expect((current.content as typeof content).confirmation.risk).toEqual([
          { type: 'fixedStop', percent: '0.03' },
        ]);
      } else if (disposition === 'discard') {
        await Promise.all([
          request(`${path}/discard`, 201, { expectedRevision: 1 }, alice.token),
          request(`${path}/discard`, 201, { expectedRevision: 1 }, alice.token),
        ]);
        expect((await request(draftPath, 200, undefined, alice.token)).content).toEqual(content);
        await request(`${path}/apply`, 409, { expectedRevision: 1 }, alice.token);
      } else {
        await request(
          draftPath,
          200,
          { expectedRevision: 1, content: { ...content, title: '用户新修订' } },
          alice.token,
          'PATCH',
        );
        expect((await request(path, 200, undefined, alice.token)).status).toBe('expired');
        await request(`${path}/apply`, 409, { expectedRevision: 1 }, alice.token);
      }
      await request(`${draftPath}/operations`, 404, undefined, bob.token);
      const history = await request(`${draftPath}/operations`, 200, undefined, alice.token);
      expect(Array.isArray(history)).toBe(true);
    }
  });
}
