import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { aiGenerationContracts, AUTHORING_LIMITS, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { generationInputBytes } from '../../src/ai/ai-generation-output.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { assembleDiscoveryGeneration, createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { prepareOptimizationGeneration } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { authoringMessages, AUTHORING_PROMPT_VERSION } from '../../src/strategy-authoring/authoring-prompt.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { createNormalizedRunConfig } from '../strategy-optimization/strategy-optimization-postgres-fixtures.js';
import { tradePlanProvider } from './trade-plan-provider.fixture.js';
import { dailyModelCases, dailyModelContent, dailyModelBaseline, dailyModelModification, dailyModelDiscoveryObjective, fixedDailyModelCase, dailyModelIssues, dailyModelExecutionIssues, dailyModelSnapshot, type DailyModelCase } from './daily-order-model.fixture.js';

const output = process.env.BACKTEST_PLAN_ACCEPTANCE_DIR;
type Entry = 'discovery' | 'authoring' | 'authoring-modification';
async function sampleRequest(entry: Entry, sample: DailyModelCase, db: PrismaService, model: string, currency: string) {
  const expected = await fixedDailyModelCase(sample);
  if (entry === 'discovery') {
    const scope = { executionInstrument: expected.executionInstrument, primaryTimeframe: expected.primaryTimeframe };
    const seed = createDiscoverySeed(scope, true);
    const experiment = { id: randomUUID(), sourceMode: 'discovery', allowedParameterIds: [], objective: dailyModelDiscoveryObjective, runConfig: createNormalizedRunConfig(), discoveryScope: scope, strategySpaceVersion: 'strategy-space-v1' } as never;
    const prepared = await prepareOptimizationGeneration({ prisma: db, experiment, strategy: seed, descriptors: [], modelKey: 'lmstudio:' + model, round: 1, useSdkContract: true, generationMode: 'native_schema' });
    // 沿用成对模型实验的受控自然语言输入；生产发现 API 不具有该自由文本字段。
    const messages = [...prepared.messages, { role: 'user' as const, content: sample.intent }];
    expect(Buffer.byteLength(JSON.stringify(messages))).toBeLessThan(16_000);
    return { intent: sample.intent, messages, schema: aiGenerationContracts.strategyDiscovery.schema, expected, seed, experiment };
  }
  const modifying = entry === 'authoring-modification';
  const before = modifying ? await dailyModelBaseline(sample) : expected;
  const content = dailyModelContent(sample, before, modifying);
  const selection = {
    kind: modifying ? 'modify' : 'generate', intent: sample.intent, providerId: 'lmstudio', model,
    expectedRevision: 1, idempotencyKey: randomUUID(), promptVersion: AUTHORING_PROMPT_VERSION, capabilityVersion: 'authoring-v1', unknownCostAcknowledgedAt: null,
    cost: { status: 'estimated', amount: '0', currency, source: 'configured_pricing', pricingVersion: null },
    ...(modifying ? dailyModelModification(sample) : {}),
  };
  const operation = { revision: 1, input: { content, selection } } as AuthoringOperation;
  return { intent: selection.intent, messages: authoringMessages(operation), schema: authoringOperationSchema(operation), expected, operation };
}

it.skipIf(!output)('原生实际模型：委托成对配置、正式保存、冻结 Worker、回放和中文', async () => {
  const directory = resolve(output!);
  const write = (name: string, value: unknown) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  const entry = process.env.BACKTEST_PLAN_ENTRY as Entry;
  expect(['discovery', 'authoring', 'authoring-modification']).toContain(entry);
  const contract = { discovery: aiGenerationContracts.strategyDiscovery, authoring: aiGenerationContracts.authoringGeneration, 'authoring-modification': aiGenerationContracts.authoringModification }[entry];
  const url = new URL(process.env.AI_PROVIDER_DATABASE_URL!);
  expect(url.hostname).toBe('127.0.0.1');
  expect(url.pathname).toBe('/ai_provider_concurrency_fixture');
  const db = new PrismaService({ datasourceUrl: url.href });
  const startedAt = Date.now();
  const results: Record<string, unknown>[] = [];
  let calls = 0;
  try {
    const row = JSON.parse(readFileSync(resolve(directory, 'provider.json'), 'utf8'));
    const model = row.settings.models[0];
    const routes = row.settings.executionRoutes as { model: string; contract: typeof contract.ref; mode: string }[];
    const route = routes.find(r => r.model === model && r.contract.id === contract.ref.id)!;
    expect(route.contract).toEqual(contract.ref);
    expect(route.mode).toBe('native_schema');
    expect(process.env.BACKTEST_PLAN_GENERATION_MODE ?? 'native_schema').toBe('native_schema');
    const qualified = await tradePlanProvider(row, write, entry);
    calls++;
    expect(qualified.resolved.execution.mode).toBe('native_schema');
    const runtime = qualified.resolved.provider.sdkRuntime!();
    const requested = process.env.BACKTEST_PLAN_CASES?.split(',');
    const samples = dailyModelCases.filter(c => !requested || requested.includes(c.id));
    expect(samples.length).toBeGreaterThan(0);
    for (const [index, sample] of samples.entries()) {
      const requestWindow = entry === 'discovery' ? 300000 : AUTHORING_LIMITS.deadlineMs;
      if (Date.now() - startedAt + requestWindow > 840000) {
        write('pending.json', { reason: '保留单次调用与清理窗口，未启动剩余样本', samples: samples.slice(index).map(s => s.id), calls });
        break;
      }
      const request = await sampleRequest(entry, sample, db, model, row.settings.modelPricing[model].costCurrency);
      const inputTokenReservation = await generationInputBytes(request.messages, 'native_schema', request.schema, contract.ref);
      write(sample.id + '-input.json', { intent: request.intent, messages: request.messages, expectedFixture: request.expected, inputTokenReservation, ...('operation' in request ? { operation: request.operation } : { seed: request.seed, experiment: request.experiment }) });
      let phase = 'generation', generation: unknown, configuration: BacktestStrategy | undefined;
      let differences: ReturnType<typeof validateAuthoringModification>['differences'] | undefined;
      try {
        calls++;
        generation = await qualified.adapter.generate({
          requestId: randomUUID(), adapter: qualified.resolved.execution.adapter, providerId: row.name,
          baseURL: runtime.baseURL, authMode: runtime.authMode ?? 'none', apiKey: runtime.apiKey, model,
          messages: request.messages, contract: contract.ref, schema: request.schema, mode: qualified.resolved.execution.mode,
          ...(qualified.resolved.execution.requestOptions ? { requestOptions: qualified.resolved.execution.requestOptions } : {}),
          transport: 'stream', maxOutputTokens: entry === 'discovery' ? 16384 : AUTHORING_LIMITS.outputTokens,
          timeout: { ...(entry === 'discovery' ? {} : { totalMs: AUTHORING_LIMITS.deadlineMs }), firstChunkMs: 90000, chunkMs: 45000 },
          signal: AbortSignal.timeout(entry === 'discovery' ? 300000 : AUTHORING_LIMITS.deadlineMs),
        });
        phase = 'validation';
        const raw = (generation as { output: unknown }).output;
        if ('seed' in request) configuration = assembleDiscoveryGeneration(request.experiment!, request.seed, raw).strategy;
        else {
          const parsed = strategySchema.safeParse((raw as { definition?: unknown }).definition);
          if (parsed.success) configuration = parsed.data as BacktestStrategy;
          if (entry === 'authoring-modification') {
            const checked = validateAuthoringModification(request.operation.input.content, request.operation.input.selection, raw);
            differences = checked.differences;
            configuration = checked.definition;
          } else configuration = validateAuthoringGeneration(request.operation.input.content, raw).definition;
        }
        const intentIssues = dailyModelIssues(sample, configuration);
        if (intentIssues.length) {
          const receipt = { id: sample.id, pair: sample.pair, phase: 'intent', category: 'model_selected_wrong_structure', intentIssues, generation, configuration, readback: backtestStrategyPlanReadback(configuration) };
          write(sample.id + '.json', receipt);
          results.push(receipt);
          console.log(JSON.stringify({ entry, sample: sample.id, category: receipt.category }));
          continue;
        }
        phase = 'persistence';
        const saved = await db.$transaction(tx => new StrategyCreationService().createInTransaction(tx, {
          ownerId: null, name: '独立原生委托 ' + entry + ' ' + sample.id, definition: configuration!, source: { kind: 'manual' },
        }));
        expect(saved.versions[0]!.schema).toEqual(configuration);
        const read = await db.strategyVersion.findUniqueOrThrow({ where: { id: saved.versions[0]!.id } });
        expect(read.schema).toEqual(configuration);
        phase = 'execution';
        const snapshots = resolve(directory, sample.id + '-snapshot');
        mkdirSync(snapshots, { mode: 0o700 });
        const f = await dailyModelSnapshot(snapshots, sample, strategySchema.parse(read.schema) as BacktestStrategy);
        const result = await f.run(), replay = await f.run(), execution = f.execute();
        expect(replay).toEqual(result);
        expect(f.execute()).toEqual(execution);
        const executionIssues = dailyModelExecutionIssues(sample, result.simulationFills);
        const category = intentIssues.length ? 'model_selected_wrong_structure' : executionIssues.length ? 'engine_execution_deviation' : 'passed';
        const baseline = 'operation' in request && entry === 'authoring-modification'
          ? { beforeConfiguration: JSON.parse(request.operation.input.content.definitionText), differences, allowedPaths: [request.operation.input.selection.modificationTarget] } : {};
        const receipt = { id: sample.id, pair: sample.pair, category, intentIssues, executionIssues, generation, configuration, readback: backtestStrategyPlanReadback(configuration), result, execution, savedVersionId: read.id, replayEqual: true, ...baseline };
        write(sample.id + '.json', receipt);
        results.push(receipt);
      } catch (error) {
        const fact = (error as { fact?: unknown }).fact;
        const receipt = { id: sample.id, pair: sample.pair, phase, category: phase === 'generation' ? 'model_generation_or_schema_failed' : phase === 'validation' ? 'model_output_rejected_by_entry' : 'execution_or_persistence_failed', message: String(error), fact, generation, configuration, readback: configuration ? backtestStrategyPlanReadback(configuration) : [] };
        write(sample.id + '.json', receipt);
        results.push(receipt);
      }
      console.log(JSON.stringify({ entry, sample: sample.id, category: results.at(-1)!.category }));
    }
    write('receipt.json', { entry, model, contract: contract.ref, mode: route.mode, calls, providerWrites: 0, historicalWrites: 0, discoveryInputBoundary: entry === 'discovery' ? '正式消息装配与合同，附加受控自然语言意图；未验收发现API自由文本入口' : null, results });
    expect(results).toHaveLength(samples.length);
    expect(results.every(r => r.category === 'passed')).toBe(true);
  } finally { await db.$disconnect(); }
}, 900000);
