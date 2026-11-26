import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import { materializeEntryPolicy } from '@thesis-ledger/domain';
import {
  aiGenerationContracts,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { generationOutput, parseGenerationOutput } from '../../src/ai/ai-generation-output.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { authoringProposal } from '../strategy-authoring/authoring-proposal.fixture.js';
import {
  dailyModelCases,
  dailyModelContent,
  dailyModelModification,
  fixedDailyModelCase,
} from './daily-order-model.fixture.js';

const require = createRequire(import.meta.url);
const Ajv = require(require.resolve('ajv', { paths: [require.resolve('eslint')] }));
const entries = ['discovery', 'authoring', 'modification'] as const;
type Entry = (typeof entries)[number];
const context = {
  response: { id: 'offline', timestamp: new Date('2026-11-18T00:00:00Z'), modelId: 'offline' },
  usage: {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  } satisfies LanguageModelUsage,
  finishReason: 'stop' as const,
};
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const evidence = process.env.BACKTEST_DAILY_APPEND_EVIDENCE_DIR;
const captureRoot = process.env.BACKTEST_DAILY_ORDER_CAPTURE_ROOT;
async function save(name: string, value: unknown) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

function setup(entry: Entry, strategy: BacktestStrategy, frozen = false) {
  const contract = {
    discovery: aiGenerationContracts.strategyDiscovery,
    authoring: aiGenerationContracts.authoringGeneration,
    modification: aiGenerationContracts.authoringModification,
  }[entry];
  const sample = dailyModelCases.find((s) => s.id === (frozen ? 'close' : 'full-fill'))!;
  const content = dailyModelContent(sample, strategy, entry === 'modification');
  const schema =
    entry === 'discovery'
      ? contract.schema
      : authoringOperationSchema({
          input: {
            content,
            selection:
              entry === 'modification'
                ? { kind: 'modify', ...dailyModelModification(sample) }
                : { kind: 'generate' },
          },
        } as never);
  const raw = (definition: BacktestStrategy) => {
    const result = authoringProposal(materializeEntryPolicy(definition), [
      { requirementId: 'rules', definitionPaths: [frozen ? 'tradePlan' : 'execution'] },
    ]);
    if (entry !== 'discovery') return result;
    const {
      schemaVersion: _schemaVersion, executionInstrument: _asset, primaryTimeframe: _period,
      cost: _cost, signalSources, ...idea
    } = result.proposal.definition;
    return {
      reason: '离线构造输入',
      evidenceRefs: [],
      strategy: {
        ...idea,
        signalSources: signalSources.map(({ asset: _asset, ...declaration }) => declaration),
      },
    };
  };
  return { schema, contract, raw, output: generationOutput('native_schema', schema, contract.ref) };
}

it.each(entries)('%s 正式原生入口的两／三／四单、反例及原值解包', async (entry) => {
  const strategy = await fixedDailyModelCase(dailyModelCases.find((s) => s.id === 'full-fill')!);
  if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('夹具');
  const orders = strategy.execution.orders;
  const prepared = setup(entry, strategy);
  const format = await prepared.output.responseFormat;
  if (format?.type !== 'json') throw new Error('缺少原生 Schema');
  await save(`${entry}-schema.json`, format.schema);
  const standard = new Ajv({ allErrors: true, strictKeywords: true }).compile(format.schema);
  const rows = [];
  for (const id of [
    'two',
    'three',
    'four',
    'five',
    'inverted',
    'third-entry',
    'missing-parent',
    'bad-parent',
    'bad-activation',
    'bad-stop-kind',
    'lone-exit-group',
    'paired-exit-group',
    'take-profit',
  ] as const) {
    const variant = structuredClone(strategy);
    if (variant.execution.timing !== 'dailyBarOrders') throw new Error('夹具');
    if (id === 'two') variant.execution.orders = orders.slice(0, 2);
    if (id === 'four') {
      variant.tradePlan!.stages = [
        {
          id: 'reduce',
          trigger: { kind: 'gainPercent', value: '0.1' },
          action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.4' },
        },
      ];
      variant.execution.orders.splice(2, 0, {
        id: 'stage',
        action: { kind: 'stage', stageId: 'reduce' },
        order: { kind: 'market' },
        validity: { kind: 'DAY' },
      });
    }
    if (id === 'five') {
      for (const id of ['stop-2', 'stop-3'])
        variant.execution.orders.push({ ...structuredClone(orders[2]!), id });
    }
    if (id === 'inverted')
      [variant.execution.orders[0], variant.execution.orders[1]] = [
        variant.execution.orders[1]!,
        variant.execution.orders[0]!,
      ];
    if (id === 'third-entry')
      variant.execution.orders.splice(2, 0, {
        ...structuredClone(orders[0]!),
        id: 'duplicate-entry',
      });
    const stop = variant.execution.orders[2];
    if (id === 'paired-exit-group') {
      stop!.exitGroup = 'g1';
      variant.execution.orders.push({
        ...structuredClone(stop!),
        id: 'profit',
        action: { kind: 'takeProfit' },
        order: { kind: 'limit', price: { type: 'constant', value: '12' } },
      });
    }
    if (id === 'lone-exit-group') stop!.exitGroup = 'g1';
    if (id === 'missing-parent') delete stop!.parent;
    if (id === 'bad-parent') stop!.parent!.templateId = 'missing';
    if (id === 'bad-activation')
      (stop!.parent as unknown as { activation: string }).activation = 'immediate';
    if (id === 'bad-stop-kind') stop!.order = { kind: 'market' };
    if (id === 'take-profit') {
      stop!.action = { kind: 'takeProfit' };
      stop!.order = { kind: 'limit', price: { type: 'constant', value: '12' } };
    }
    const raw = prepared.raw(variant);
    const valid = ['two', 'three', 'four', 'five', 'take-profit', 'paired-exit-group'].includes(id);
    // execution 局部修改不能顺带改变冻结的 tradePlan；四单使用已有阶段的基线。
    const active = entry === 'modification' && id === 'four' ? setup(entry, variant) : prepared;
    const activeFormat = await active.output.responseFormat;
    if (activeFormat?.type !== 'json') throw new Error('缺少原生 Schema');
    const validator =
      active === prepared
        ? standard
        : new Ajv({ allErrors: true, strictKeywords: true }).compile(activeFormat.schema);
    const standardAccepted = validator(raw);
    expect(standardAccepted, `${entry}/${id}: ${JSON.stringify(validator.errors)}`).toBe(
      valid || id === 'bad-parent',
    ); // 引用存在性由应用业务校验负责。
    const parsed = active.output.parseCompleteOutput({ text: JSON.stringify(raw) }, context);
    if (valid) {
      const result = await parsed;
      const expected = active.schema.parse(raw);
      expect(result).toEqual(expected);
      expect(parseGenerationOutput('native_schema', active.schema, result)).toEqual(expected);
    } else await expect(parsed).rejects.toThrow();
    if (id === 'inverted') {
      expect(prepared.schema.safeParse(raw).success).toBe(true);
      expect(strategySchema.safeParse(variant).success).toBe(true);
      // 文本模式沿用既有行为，不把新入口校验下沉到持久化或文本解析。
      expect(parseGenerationOutput('json_mode', prepared.schema, raw)).toEqual(
        prepared.schema.parse(raw),
      );
      expect(parseGenerationOutput('json_validated', prepared.schema, JSON.stringify(raw))).toEqual(
        prepared.schema.parse(raw),
      );
    }
    rows.push({
      id,
      source: 'constructed',
      standardAccepted,
      applicationAccepted: valid,
      standardErrors: structuredClone(validator.errors),
    });
  }
  await save(`${entry}-matrix.json`, rows);
});

it('修改范围外历史 [entry,stopLoss,exit] 精确冻结并通过正式原生入口', async () => {
  const strategy = await fixedDailyModelCase(dailyModelCases.find((s) => s.id === 'full-fill')!);
  if (strategy.execution.timing !== 'dailyBarOrders') throw new Error('夹具');
  const [entry, exit, stop] = strategy.execution.orders;
  strategy.execution.orders = [entry!, stop!, exit!];
  const prepared = setup('modification', strategy, true);
  const format = await prepared.output.responseFormat;
  if (format?.type !== 'json') throw new Error('缺少原生 Schema');
  const standard = new Ajv({ allErrors: true, strictKeywords: true }).compile(format.schema);
  const raw = prepared.raw(strategy);
  expect(standard(raw)).toBe(true);
  const parsed = await prepared.output.parseCompleteOutput({ text: JSON.stringify(raw) }, context);
  expect((parsed as { proposal: { definition: BacktestStrategy } }).proposal.definition.execution).toEqual(
    strategy.execution,
  );
  const changed = structuredClone(strategy);
  if (changed.execution.timing !== 'dailyBarOrders') throw new Error('夹具');
  [changed.execution.orders[1], changed.execution.orders[2]] = [
    changed.execution.orders[2]!,
    changed.execution.orders[1]!,
  ];
  expect(standard(prepared.raw(changed))).toBe(false);
  await expect(
    prepared.output.parseCompleteOutput({ text: JSON.stringify(prepared.raw(changed)) }, context),
  ).rejects.toThrow();
  await save('frozen-matrix.json', {
    source: 'constructed',
    roles: ['entry', 'stopLoss', 'exit'],
    standardAccepted: true,
    applicationAccepted: true,
    reorderedAccepted: false,
  });
});

it.skipIf(!captureRoot)('只读回归旧合格三单和当前完整捕获，保留原失败及截断事实', async () => {
  const rows = [];
  for (const prefix of ['contract', 'slots'])
    for (const entry of entries)
      for (const [batch, ids] of [
        ['a', ['limit', 'market', 'touch', 'close']],
        ['b', ['each-fill', 'full-fill', 'day', 'two-bars']],
      ] as const) {
        for (const [index, id] of ids.entries()) {
          const dir = join(
            captureRoot!,
            `backtest-daily-orders-${prefix}-${entry}-${batch}-20261117`,
          );
          const raw = await read(join(dir, `wire-output-${index + 2}-1.json`));
          if (raw.finalJsonAvailable === false) {
            rows.push({ prefix, entry, id, source: 'capture', truncated: true });
            continue;
          }
          const input = await read(join(dir, `${id}-input.json`));
          const contract = {
            discovery: aiGenerationContracts.strategyDiscovery,
            authoring: aiGenerationContracts.authoringGeneration,
            modification: aiGenerationContracts.authoringModification,
          }[entry];
          const schema =
            entry === 'discovery' ? contract.schema : authoringOperationSchema(input.operation);
          const output = generationOutput('native_schema', schema, contract.ref);
          const format = await output.responseFormat;
          if (format?.type !== 'json') throw new Error('缺少原生 Schema');
          const standard = new Ajv({ allErrors: true, strictKeywords: true }).compile(
            format.schema,
          );
          const originalWire = await read(join(dir, `wire-${index + 2}-1.json`));
          const originalStandard = new Ajv({ allErrors: true, strictKeywords: true }).compile(
            originalWire.responseFormat.json_schema.schema,
          );
          const oldAccepted = originalStandard(raw);
          const standardAccepted = standard(raw);
          if (prefix === 'slots')
            expect(standardAccepted, `${prefix}/${entry}/${id}`).toBe(oldAccepted);
          const zod = schema.safeParse(raw);
          let applicationAccepted = false;
          let parsed: unknown;
          try {
            parsed = await output.parseCompleteOutput({ text: JSON.stringify(raw) }, context);
            applicationAccepted = true;
          } catch {
            /* 捕获的原失败仍须拒绝。 */
          }
          if (applicationAccepted) expect(parsed).toEqual(zod.success ? zod.data : undefined);
          const newlyRejectedOrder =
            prefix === 'contract' &&
            ['discovery', 'authoring'].includes(entry) &&
            id === 'two-bars';
          expect(applicationAccepted, `${prefix}/${entry}/${id}`).toBe(
            zod.success && !newlyRejectedOrder,
          );
          rows.push({
            prefix,
            entry,
            id,
            source: 'capture',
            oldAccepted,
            standardAccepted,
            applicationAccepted,
            schemaBytes: Buffer.byteLength(JSON.stringify(format.schema)),
            oldSchemaBytes: Buffer.byteLength(
              JSON.stringify(originalWire.responseFormat.json_schema.schema),
            ),
          });
        }
      }
  expect(rows).toHaveLength(48);
  await save('capture-regression.json', rows);
});
