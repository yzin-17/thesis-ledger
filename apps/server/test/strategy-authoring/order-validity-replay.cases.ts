import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import type { BacktestSnapshotManifestV3, BacktestStrategy } from '@thesis-ledger/schemas';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import type { AuthoringExecutionCaseContext } from './authoring-execution.case-context.js';

const root = process.env.BACKTEST_DAILY_ORDER_CAPTURE_ROOT;
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const samples = [
  ['day', 'backtest-daily-orders-remaining20-20261118/schema-modification'],
  ['two-bars', 'whole-order-model-20261118/modify'],
] as const;

export function registerOrderValidityReplay(getContext: () => AuthoringExecutionCaseContext) {
  it.skipIf(!root)('已有买单有效期真实回执经正式确认、保存和冻结回放', async () => {
    const ctx = getContext();
    const { token } = ctx.alice;
    const archive = join(root!, 'order-validity-pilot-live-20261119-133724');
    const catalog = await ctx.db.instrument.create({
      data: {
        canonicalCode: '159516',
        instrumentType: 'ETF',
        market: 'SZ',
        displayName: '隔离验收 ETF',
        generation: 1,
      },
    });
    for (const [name, source] of samples) {
      const { operation } = read(join(root!, source, name + '-input.json'));
      const { content, selection } = operation.input;
      const expected = read(join(archive, name + '-check.json')).definition;
      const previous = JSON.parse(content.definitionText);
      const expectedDiff = {
        path: 'execution.orders.0.validity',
        before: previous.execution.orders[0].validity,
        after: expected.execution.orders[0].validity,
      };
      const draft = await ctx.request(
        '/strategy-authoring/drafts',
        201,
        {
          ...content,
          definitionText: '',
          confirmation: { ...content.confirmation, instrumentId: catalog.id },
        },
        token,
      );
      const path = '/strategy-authoring/drafts/' + draft.id;
      // 正式保存需要本草稿有已应用的成功生成记录。用本地受控响应建立原定义。
      ctx.output = { intentCheck: '恢复冻结基线', proposal: { definition: previous, coverage: [{ requirementId: 'rules', definitionPaths: ['execution'] }] } };
      const generated = await ctx.request(path + '/operations', 201, { ...ctx.selection(name + '-baseline'), kind: 'generate' }, token);
      expect(await ctx.observe(String(generated.id))).toMatchObject({ status: 'succeeded' });
      await ctx.request('/strategy-authoring/operations/' + generated.id + '/apply-generation', 201, { expectedRevision: 1 }, token);
      const baseline = await ctx.request(path + '/review', 200, undefined, token);
      expect(baseline.definition).toEqual(previous);
      const responsesBefore = ctx.providerCalls;
      ctx.output = read(join(archive, name + '-response.json')).text;
      const submitted = await ctx.request(
        path + '/operations',
        201,
        {
          ...ctx.selection(name),
          expectedRevision: 2,
          kind: 'modify',
          modificationTarget: 'entryOrderValidity',
          intent: selection.intent,
        },
        token,
      );
      const id = String(submitted.id);
      const completed = await ctx.observe(id);
      expect(completed).toMatchObject({
        status: 'succeeded',
        outcome: {
          externalResult: 'received',
          outputText: JSON.stringify(JSON.parse(String(ctx.output))),
        },
      });
      const stored = await ctx.operations.read(ctx.alice.principal.id, id);
      expect(stored.input.selection.promptVersion).toBe('authoring-order-validity-v1');
      const wire = read(join(archive, name + '-request.json')).body;
      expect(ctx.modelBodies.at(-1)).toMatchObject({

        response_format: wire.response_format,
        max_tokens: wire.max_tokens,
        stream: true,
      });
      const messages = (ctx.modelBodies.at(-1) as unknown as { messages: {role: string; content: string}[] }).messages;
      expect(messages.map(m => m.role)).toEqual(['system','user']);
      expect(messages[0]).toEqual(wire.messages[0]);
      expect(JSON.parse(messages[1]!.content)).toEqual({ ...JSON.parse(wire.messages[1].content), revision: 2 });
      const op = '/strategy-authoring/operations/' + id;
      const revision = { expectedRevision: 2 };
      const proposal = await ctx.request(op + '/proposal', 201, revision, token);
      const payload = proposal.payload as {
        differences: { path: string; before: string; after: string }[];
        afterText: string;
      };
      expect(proposal).toMatchObject({
        status: 'pending',
        payload: { allowedPaths: [expectedDiff.path] },
      });
      expect(
        payload.differences.map((d) => ({
          path: d.path,
          before: JSON.parse(d.before),
          after: JSON.parse(d.after),
        })),
      ).toEqual([expectedDiff]);
      expect(JSON.parse(payload.afterText)).toEqual(expected);
      expect(await ctx.request(path + '/review', 200, undefined, token)).toEqual(baseline);
      await ctx.request(path + '/save', 409, { ...revision, name, reviewedDefinitionHash: baseline.definitionHash }, token);
      const apply = '/strategy-authoring/proposals/' + proposal.id + '/apply';
      await ctx.request(apply, 409, { expectedRevision: 1 }, token);
      const applied = await ctx.request(apply, 201, revision, token);
      expect(await ctx.request(apply, 201, revision, token)).toEqual(applied);
      const review = await ctx.request(path + '/review', 200, undefined, token);
      expect(review).toMatchObject({ revision: 3, definition: expected });
      const save = { expectedRevision: 3, name, reviewedDefinitionHash: review.definitionHash };
      const saved = await ctx.request(path + '/save', 201, save, token);
      expect(await ctx.request(path + '/save', 201, save, token)).toEqual(saved);
      const version = await ctx.db.strategyVersion.findUniqueOrThrow({
        where: { id: String(saved.versionId) },
      });
      expect(version.schema).toEqual(expected);
      expect(version.source).toEqual({ kind: 'ai_assisted', referenceId: draft.id });
      const provenance = await ctx.request(
        '/strategy-authoring/versions/' + version.id + '/source',
        200,
        undefined,
        token,
      );
      expect(provenance).toMatchObject({ revision: 3, snapshot: { operationIds: [generated.id, id] } });
      expect(ctx.providerCalls).toBe(responsesBefore + 1);

      const snapshot = join(archive, name + '-snapshot');
      const historical = read(join(archive, name + '-replay.json'));
      const manifest: BacktestSnapshotManifestV3 = read(
        join(snapshot, 'snapshots', historical.result.runId, 'finalized.json'),
      );
      expect(hashCanonicalManifest(version.schema)).toBe(manifest.strategyVersionHash);
      const runner = new LocalSnapshotV3Runner(new LocalSnapshotStore(snapshot));
      const result = await runner.run(
        {
          runId: manifest.runId,
          snapshotRef: { snapshotId: manifest.contentHash!, contentHash: manifest.contentHash! },
          artifactRefs: manifest.artifacts,
        },
        new AbortController().signal,
      );
      expect(result).toEqual(historical.result);
      const evidence = process.env.ORDER_VALIDITY_REPLAY_DIR;
      if (evidence) writeFileSync(join(evidence, name + '.json'), JSON.stringify({
        draftId: draft.id, operationId: id, proposalId: proposal.id, savedVersionId: version.id,
        beforeConfiguration: baseline.definition, configuration: version.schema, allowedPaths: [expectedDiff.path],
        differences: payload.differences, readback: historical.readback, resultChecksum: result.resultChecksum,
        snapshotId: result.snapshotId, reviewedDefinitionHash: review.definitionHash,
      }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      expect(backtestStrategyPlanReadback(version.schema as BacktestStrategy)).toEqual(
        historical.readback,
      );
    }
  });
}
