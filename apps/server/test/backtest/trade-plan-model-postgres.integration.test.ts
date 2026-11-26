import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  aiGenerationContracts,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import {
  assembleDiscoveryGeneration,
  createDiscoverySeed,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { strategyOptimizationPrompt } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import {
  modelPlanConforms,
  modelExecutionConforms,
} from './trade-plan-model-evaluation.fixture.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradePlanProvider } from './trade-plan-provider.fixture.js';
import {
  tradePlanModelScenario,
  modelScenarioSnapshot,
} from './trade-plan-model-scenario.fixture.js';

const output = process.env.BACKTEST_PLAN_ACCEPTANCE_DIR;
const captured = process.env.BACKTEST_PLAN_CAPTURE_DIR;
const cases = [
  {
    id: 'initial-half',
    intent:
      '空仓就投入权益的20%买入。此后收盘比最初买入价上涨8%，只卖最初买入数量的四分之一一次；到上涨15%时再卖最初买入数量的一半一次。初始亏损5%退出。止损全部平仓后等10根完整行情才能再买。不要加其他退出条件。',
  },
  {
    id: 'remaining-half',
    intent:
      '空仓就投入权益的20%买入。此后收盘比最初买入价上涨8%，只卖当时剩余数量的四分之一一次；到上涨15%时再卖当时剩余数量的一半一次。初始亏损5%退出。止损全部平仓后等10根完整行情才能再买。不要加其他退出条件。',
  },
  {
    id: 'fixed-stop',
    intent:
      '空仓就投入权益的20%买入。以最初买入成交价下方5%固定保护，价格上涨也不移动；收盘达到保护条件才在下个可交易开盘全部退出。平仓后等10根完整行情才能再买，不要加其他退出条件。',
    trailing: false,
  },
  {
    id: 'trailing-stop',
    intent:
      '空仓就投入权益的20%买入。初始保护放在最初买入成交价下方5%；盈利达到10%后，保护线跟随此后最高收盘价下方5%逐步上移，永不下移。收盘达到保护条件才在下个可交易开盘全部退出。平仓后等10根完整行情才能再买，不要加其他退出条件。',
    trailing: true,
  },
];

it.skipIf(!output)(
  '实际 lmstudio：无字段名成对意图→正式装配保存→快照 Worker→中文回读',
  async () => {
    const directory = resolve(output!);
    const write = (name: string, value: unknown) =>
      writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
    const dbUrl = new URL(process.env.AI_PROVIDER_DATABASE_URL!);
    expect(dbUrl.hostname).toBe('127.0.0.1');
    expect(dbUrl.pathname).toBe('/ai_provider_concurrency_fixture');
    const db = new PrismaService({ datasourceUrl: dbUrl.href });
    const results: { category: string }[] = [];
    try {
      const providerRow = JSON.parse(readFileSync(resolve(directory, 'provider.json'), 'utf8'));
      const qualified = captured ? null : await tradePlanProvider(providerRow, write);
      const model = providerRow.settings.models[0];
      const { input } = await completeSnapshotFixture();
      let seed: BacktestStrategy = [
        'session-vwap',
        'atr-protection',
        'condition-protection',
      ].includes(process.env.BACKTEST_PLAN_SCENARIO ?? '')
        ? tradePlanModelScenario().configuration(false)
        : input.strategy;
      const scope = {
        executionInstrument: seed.executionInstrument,
        primaryTimeframe: seed.primaryTimeframe,
      };
      if (!captured) seed = createDiscoverySeed(scope);
      else if (existsSync(resolve(captured, 'seed.json')))
        seed = strategySchema.parse(
          JSON.parse(readFileSync(resolve(captured, 'seed.json'), 'utf8')),
        ) as BacktestStrategy;
      // 历史捕获沿用原种子；新捕获必须记录正式入口实际使用的种子。
      write('seed.json', seed);
      const experiment = {
        id: randomUUID(),
        sourceMode: 'discovery',
        allowedParameterIds: [],
        runConfig: input.runConfig,
        strategySpaceVersion: 'strategy-space-v1',
        discoveryScope: scope,
        objective: { mode: 'balanced', minClosedTrades: 1 },
      } as never;
      const requested = process.env.BACKTEST_PLAN_CASES?.split(',');
      const source = tradePlanModelScenario(seed.cost).cases ?? cases;
      const samples = source.filter((c) => !requested || requested.includes(c.id));
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of samples) {
        const previous = captured
          ? JSON.parse(readFileSync(resolve(captured, sample.id + '.json'), 'utf8'))
          : null;
        const intent = previous?.intent ?? sample.intent;
        const confirmedCost = captured ? previous.confirmedCost : seed.cost;
        const messages = previous?.messages ?? [
          ...(await strategyOptimizationPrompt({
            prisma: db,
            experiment,
            strategy: seed,
            descriptors: [],
            modelKey: 'lmstudio-acceptance',
            round: 1,
            useSdkContract: true,
          })),
          {
            role: 'user',
            content:
              sample.intent +
              (seed.primaryTimeframe === '1d'
                ? ' 使用每日收盘判断；'
                : ' 使用已完成一分钟收盘判断；') +
              '不需要价格绝对值或新的资料。',
          },
        ];
        let generation: unknown,
          configuration: ReturnType<typeof assembleDiscoveryGeneration>['strategy'] | undefined;
        try {
          if (captured) generation = previous.generation;
          else {
            const { adapter, resolved, row } = qualified!;
            const runtime = resolved.provider.sdkRuntime!();
            generation = await adapter.generate({
              requestId: randomUUID(),
              adapter: resolved.execution.adapter,
              providerId: row.name,
              baseURL: runtime.baseURL,
              authMode: runtime.authMode ?? 'none',
              apiKey: runtime.apiKey,
              model,
              messages,
              contract: aiGenerationContracts.strategyDiscovery.ref,
              schema: aiGenerationContracts.strategyDiscovery.schema,
              mode: resolved.execution.mode,
              ...(resolved.execution.requestOptions
                ? { requestOptions: resolved.execution.requestOptions }
                : {}),
              transport: 'stream',
              maxOutputTokens: 16384,
              timeout: { firstChunkMs: 90000, chunkMs: 45000 },
              signal: AbortSignal.timeout(300000),
            });
          }
          configuration = assembleDiscoveryGeneration(
            experiment,
            seed,
            (generation as { output: unknown }).output,
          ).strategy;
          const saved = await db.$transaction((tx) =>
            new StrategyCreationService().createInTransaction(tx, {
              ownerId: null,
              name: '模拟交易计划 ' + sample.id,
              definition: configuration,
              source: { kind: 'manual' },
            }),
          );
          expect(saved.versions[0]!.schema).toEqual(configuration);
          const snapshots = resolve(directory, sample.id + '-snapshot');
          mkdirSync(snapshots, { mode: 0o700 });
          const fixture = await modelScenarioSnapshot(snapshots, configuration);
          const result = await fixture.run(),
            replay = await fixture.run(),
            execution = fixture.execute();
          expect(replay).toEqual(result);
          const conforms = modelPlanConforms(sample.id, configuration, confirmedCost);
          let category = 'passed';
          if (!conforms) category = 'model_selected_wrong_structure';
          else if (!modelExecutionConforms(sample.id, execution.fills, confirmedCost))
            category = 'engine_execution_deviation';
          const receipt = {
            id: sample.id,
            category,
            configuration,
            readback: backtestStrategyPlanReadback(configuration),
            execution,
            result,
          };
          write(sample.id + '.json', { intent, confirmedCost, messages, generation, ...receipt });
          results.push(receipt);
        } catch (error) {
          const receipt = {
            id: sample.id,
            category: configuration
              ? 'execution_or_persistence_failed'
              : 'generation_or_assembly_failed',
            message: String(error),
            generation,
            configuration,
            readback: configuration ? backtestStrategyPlanReadback(configuration) : [],
          };
          write(sample.id + '.json', { intent, confirmedCost, messages, ...receipt });
          results.push(receipt);
        }
      }
      write('receipt.json', {
        model,
        calls: captured ? 0 : samples.length + 1,
        providerWrites: 0,
        historicalWrites: 0,
        results,
      });
      expect(results).toHaveLength(samples.length);
      expect(results.every((result) => result.category === 'passed')).toBe(true);
    } finally {
      await db.$disconnect();
    }
  },
  900000,
);
