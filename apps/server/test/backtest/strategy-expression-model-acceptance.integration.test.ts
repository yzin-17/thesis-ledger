import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  AUTHORING_LIMITS,
  strategyCapabilityGapSchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback, strategyCapabilityGapLines } from '@thesis-ledger/domain';
import { validateGenerationRequest } from '../../src/ai/ai-generation-output.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { validateAuthoringAnalysis } from '../../src/strategy-authoring/authoring-analysis.js';
import {
  createDiscoverySeed,
  assembleDiscoveryGeneration,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { createNormalizedRunConfig } from '../strategy-optimization/strategy-optimization-postgres-fixtures.js';
import type { tradePlanProvider } from './trade-plan-provider.fixture.js';
import { expressionQualifiedProvider } from './strategy-expression-qualification.fixture.js';
import { expressionModelSnapshot } from './strategy-expression-model-snapshot.fixture.js';
import {
  expressionModelCases,
  expressionModelRequest,
} from './strategy-expression-model.fixture.js';

function expressionModelStorage(directory: string, live: boolean) {
  const dbUrl = live ? new URL(process.env.AI_PROVIDER_DATABASE_URL!) : null;
  if (dbUrl) {
    expect(dbUrl.hostname).toBe('127.0.0.1');
    expect(dbUrl.pathname).toBe('/ai_provider_concurrency_fixture');
  }
  const db = dbUrl ? new PrismaService({ datasourceUrl: dbUrl.href }) : null;
  const providerRow = live
    ? JSON.parse(readFileSync(resolve(directory, 'provider.json'), 'utf8'))
    : null;
  return { db, providerRow };
}

const preview = process.env.STRATEGY_EXPRESSION_PREVIEW_DIR;
const live = !preview && process.env.STRATEGY_EXPRESSION_MODEL_LIVE === '1';
it.skipIf(!preview && !live)(
  '策略表达：预览或明确授权后的单次模型矩阵',
  async () => {
    const directory = resolve(preview ?? process.env.BACKTEST_PLAN_ACCEPTANCE_DIR!);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const write = (name: string, value: unknown) =>
      writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
    const { db, providerRow } = expressionModelStorage(directory, live);
    const qualified = new Map<string, Awaited<ReturnType<typeof tradePlanProvider>>>();
    const scope = {
      executionInstrument: {
        symbol: '159516.SZ',
        market: 'CN' as const,
        assetType: 'etf' as const,
      },
      primaryTimeframe: '1d' as const,
    };
    const seed = {
      ...createDiscoverySeed(scope, true),
      cost: { commissionRate: '0.0003', slippageRate: '0.001' },
    };
    const experiment = {
      sourceMode: 'discovery',
      discoveryScope: scope,
      runConfig: createNormalizedRunConfig(),
      objective: { mode: 'balanced', minClosedTrades: 1 },
      strategySpaceVersion: 'strategy-space-v1',
    } as ExperimentRow;
    const receipts: { id: string; category: string }[] = [];
    const requested = process.env.BACKTEST_PLAN_CASES?.split(',');
    const samples = expressionModelCases.filter(
      (sample) => !requested || requested.includes(sample.id),
    );
    expect(samples.length).toBeGreaterThan(0);
    const qualificationRoot = process.env.STRATEGY_EXPRESSION_QUALIFICATION_DIR;
    if (qualificationRoot) expect(resolve(qualificationRoot)).toContain('/var/acceptance/');
    try {
      for (const sample of samples) {
        const { operation, contract, schema, messages } = await expressionModelRequest(
          sample,
          experiment,
          seed,
          db,
        );
        validateGenerationRequest({
          requestId: 'preview',
          adapter: 'openai-compatible-chat',
          contract: contract.ref,
          schema,
          messages,
          mode: 'native_schema',
        });
        write(sample.id + '-input.json', {
          ...sample,
          contract: contract.ref,
          operation,
          messages,
          messageHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex'),
        });
        if (!live) {
          receipts.push({ id: sample.id, category: 'preview_only' });
          continue;
        }
        let phase = 'qualification';
        let generation;
        let definition: BacktestStrategy | undefined;
        try {
          let provider = qualified.get(sample.entry);
          if (!provider) {
            provider = await expressionQualifiedProvider({
              directory,
              entry: sample.entry,
              qualificationRoot,
              providerRow,
              capture: (name, value) => write(sample.entry + '/' + name, value),
            });
            qualified.set(sample.entry, provider);
          }
          phase = 'generation';
          const runtime = provider.resolved.provider.sdkRuntime!();
          generation = await provider.adapter.generate({
            requestId: randomUUID(),
            adapter: provider.resolved.execution.adapter,
            providerId: provider.row.name,
            baseURL: runtime.baseURL,
            authMode: 'none',
            apiKey: runtime.apiKey,
            model: provider.model,
            contract: contract.ref,
            schema,
            messages,
            mode: provider.resolved.execution.mode,
            ...(provider.resolved.execution.requestOptions
              ? { requestOptions: provider.resolved.execution.requestOptions }
              : {}),
            transport: 'stream',
            maxOutputTokens: sample.entry === 'discovery' ? 16384 : AUTHORING_LIMITS.outputTokens,
            timeout: { firstChunkMs: 90000, chunkMs: 45000 },
            signal: AbortSignal.timeout(300000),
          });
          phase = 'formal_validation';
          if (sample.entry === 'authoring-analysis') {
            const analysis = validateAuthoringAnalysis(
              operation!.input.content,
              1,
              generation.output,
            );
            expect(analysis.questions.length).toBeGreaterThan(0);
            expect(analysis.requirements.some((item) => item.state === 'unresolved')).toBe(true);
            write(sample.id + '.json', { category: 'analysis_validated', generation, analysis });
            receipts.push({ id: sample.id, category: 'analysis_validated' });
            continue;
          }
          const gap = strategyCapabilityGapSchema.safeParse(generation.output);
          if (gap.success) {
            expect(sample.id).toBe('unsupported-data-portfolio');
            write(sample.id + '.json', {
              category: 'capability_gap_validated',
              generation,
              readback: strategyCapabilityGapLines(gap.data),
            });
            receipts.push({ id: sample.id, category: 'capability_gap_validated' });
            continue;
          }
          expect(sample.id).not.toBe('unsupported-data-portfolio');
          if (sample.entry === 'discovery')
            definition = assembleDiscoveryGeneration(experiment, seed, generation.output).strategy;
          else if (sample.entry === 'authoring-modification')
            definition = validateAuthoringModification(
              operation!.input.content,
              operation!.input.selection,
              generation.output,
            ).definition;
          else
            definition = validateAuthoringGeneration(
              operation!.input.content,
              generation.output,
            ).definition;
          phase = 'persistence';
          const saved = await db!.$transaction((tx) =>
            new StrategyCreationService().createInTransaction(tx, {
              ownerId: null,
              name: sample.id,
              definition: definition!,
              source: { kind: 'manual' },
            }),
          );
          expect(saved.versions[0]!.schema).toEqual(definition);
          phase = 'frozen_replay';
          const snapshot = await expressionModelSnapshot(
            resolve(directory, sample.id + '-snapshot'),
            definition,
          );
          const result = await snapshot.run();
          expect(await snapshot.run()).toEqual(result);
          write(sample.id + '.json', {
            category: 'formal_vertical_validated',
            generation,
            definition,
            readback: backtestStrategyPlanReadback(definition),
            result,
            semanticReview: '待按原始意图逐项人工对照',
          });
          receipts.push({ id: sample.id, category: 'formal_vertical_validated' });
        } catch (error) {
          write(sample.id + '.json', {
            category: 'failed',
            phase,
            message: String(error),
            generation,
            definition,
          });
          receipts.push({ id: sample.id, category: 'failed' });
          // 每个样本一次，不自动重试；资格失败或传输未知时停止增加调用。
          if (phase === 'qualification' || phase === 'generation') break;
        }
      }
      write('receipt.json', {
        previewOnly: !live,
        maximumBusinessCalls: samples.length,
        maximumQualificationCalls: process.env.STRATEGY_EXPRESSION_REQUIRE_CACHED_QUALIFICATION === '1' ? 0 : 4,
        receipts,
      });
      expect(receipts.some((item) => item.category === 'failed')).toBe(false);
      expect(receipts.length).toBe(samples.length);
    } finally {
      await db?.$disconnect();
    }
  },
  5_400_000,
);
