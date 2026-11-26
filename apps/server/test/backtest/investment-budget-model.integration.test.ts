import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import type * as SchemaExports from '@thesis-ledger/schemas';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import type { BacktestStrategy, OptimizationDiscoveryProposal } from '@thesis-ledger/schemas';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { createStoredAiProvider } from '../../src/ai/ai-provider-runtime.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { routeSnapshotsFromProviderRow } from '../../src/ai/ai-provider-readiness.persistence.js';
import { StrategyOptimizationSdkExecutor } from '../../src/strategy-optimization/strategy-optimization-sdk-executor.js';
import { StrategyOptimizationAiSettlementStore } from '../../src/strategy-optimization/strategy-optimization-ai-settlement.store.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { createDiscoveryExperiment } from '../../src/strategy-optimization/strategy-optimization-discovery-store.js';
import type {
  CandidateRow,
  ExperimentRow,
  StrategyVersionRecord,
} from '../../src/strategy-optimization/strategy-optimization-common.js';
import { optimizationSha256 } from '../../src/strategy-optimization/strategy-optimization-common.js';
import * as prompts from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { executeBacktestV3Run } from '../../src/backtest/backtest-v3-run-execution.js';
import {
  investmentSnapshot,
  verifyInvestmentFills,
  type FrozenInvestmentInput,
} from './investment-budget-frozen.fixture.js';
import {
  investmentCases,
  controlledInvestmentStrategy,
  verifyInvestmentPlan,
} from './investment-budget-intents.fixture.js';
import { restoreInvestmentCapture } from './investment-budget-capture.fixture.js';

const directory = process.env.INVESTMENT_AI_DIRECTORY;
const live = process.env.INVESTMENT_AI_LIVE === '1';
const capture = process.env.INVESTMENT_AI_CAPTURE;
const requestedCases = process.env.INVESTMENT_AI_CASES?.split(',');
const selectedCases = investmentCases.filter(
  (sample) => !requestedCases || requestedCases.includes(sample.id),
);
const requestCeiling = Number(process.env.INVESTMENT_AI_TIMEOUT_MS ?? 120000);

// 锁定目标运行态的真实合同，避免相邻 v6 工作改变本次已验证的 v5 请求。
// 不改写路由版本或 readiness；生成和装配均使用导出的原始 v5 Schema。
vi.mock('@thesis-ledger/schemas', async (importOriginal) => {
  const current = await importOriginal<typeof SchemaExports>();
  if (process.env.INVESTMENT_AI_DEPLOYED_SCHEMA !== '1') return current;
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const deployed = await import(
    pathToFileURL(resolve(process.env.INVESTMENT_AI_DIRECTORY!, 'deployed-schemas/index.js')).href
  );
  if (deployed.aiGenerationContracts.strategyDiscovery.ref.version !== 'strategy-discovery-v5')
    throw new Error('本次验收只允许目标运行态 v5 合同');
  return {
    ...current,
    aiGenerationContracts: deployed.aiGenerationContracts,
    optimizationDiscoveryGenerationOutputSchema:
      deployed.optimizationDiscoveryGenerationOutputSchema,
  };
});

it.skipIf(!directory)(
  '真实实验生成与结算、候选保存、原冻结行情 Runner 及逐笔投入验收',
  async () => {
    const dir = resolve(directory!);
    assert(
      selectedCases.length > 0 &&
        (!requestedCases || selectedCases.length === requestedCases.length),
    );
    assert(
      Number.isInteger(requestCeiling) && requestCeiling >= 120000 && requestCeiling <= 300000,
    );
    const source = JSON.parse(
      readFileSync(resolve(dir, 'input.json'), 'utf8'),
    ) as FrozenInvestmentInput & { provider: Parameters<typeof createStoredAiProvider>[0] };
    const output = resolve(dir, process.env.INVESTMENT_AI_LABEL ?? (live ? 'live' : 'controlled'));
    assert(output.startsWith(dir + '/'), '输出不得离开本次验收目录');
    mkdirSync(output, { mode: 0o700 });
    const write = (name: string, value: unknown) =>
      writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
    const url = new URL(process.env.AI_PROVIDER_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.pathname, '/ai_provider_concurrency_fixture');
    const db = new PrismaService({ datasourceUrl: url.href });
    assert(!(live && capture), '捕获复核禁止真实模型调用');
    const captured = capture ? await restoreInvestmentCapture(db, dir, capture) : undefined;
    const results: { id: string; status: string; [key: string]: unknown }[] = [];
    let calls = 0,
      intent = '';
    const actualPrompt = prompts.strategyOptimizationPrompt;
    const promptSpy = vi
      .spyOn(prompts, 'strategyOptimizationPrompt')
      .mockImplementation(async (input) => [
        ...(await actualPrompt(input)),
        {
          role: 'user',
          content: intent + ' 仅收盘决策，在下一可成交开盘执行；采用冻结的成本和标的设置。',
        },
      ]);
    try {
      const row = {
        ...source.provider,
        updatedAt: new Date(source.provider.updatedAt),
        encryptedCredentials: null,
      };
      const settings = parseAiProviderSettings(row.settings)!;
      assert.equal(settings.authMode, 'none');
      const provider = await createStoredAiProvider(
        row,
        {
          readCredential: () => {
            throw Error('禁止读取凭据');
          },
        },
        30000,
      );
      assert(provider);
      const providers = new AiProviderRegistry();
      providers.replace([provider], routeSnapshotsFromProviderRow(row, settings, row.health));
      const adapter = new AiSdkGenerationAdapter();
      const generate = adapter.generate.bind(adapter);
      adapter.generate = async (input) => {
        assert(live, '受控预检禁止调用 Provider');
        assert(calls < selectedCases.length, '超过本次选定类型的真实调用上限');
        const call = ++calls;
        write(`request-${call}.json`, {
          requestId: input.requestId,
          model: input.model,
          contract: input.contract,
          mode: input.mode,
          messages: input.messages,
          maxOutputTokens: input.maxOutputTokens,
          generationSchema: z.toJSONSchema(input.schema),
        });
        try {
          const generation = await generate(input);
          write(`response-${call}.json`, generation);
          return generation;
        } catch (error) {
          write(`response-${call}.json`, {
            error: String(error),
            fact: (error as { fact?: unknown }).fact,
            cause: String((error as Error).cause),
          });
          throw error;
        }
      };
      const runs = new StrategyOptimizationRunService(db, {} as never);
      if (requestCeiling !== 120000) {
        const remainingTimeout = runs.requestTimeoutMs.bind(runs);
        vi.spyOn(runs, 'requestTimeoutMs').mockImplementation((experiment) =>
          remainingTimeout(experiment, requestCeiling),
        );
      }
      const executions = new AiExecutionStateStore(db);
      const sdk = new StrategyOptimizationSdkExecutor(
        db,
        providers,
        adapter,
        executions,
        new StrategyOptimizationAiSettlementStore(executions),
      );
      const candidates = new StrategyOptimizationCandidateService(db, providers, runs, sdk);
      for (const sample of selectedCases) {
        const capturedSample = captured?.samples.find((item) => item.id === sample.id);
        if (captured && !capturedSample) continue;
        let experiment: ExperimentRow | undefined;
        intent = sample.intent;
        try {
          const config = structuredClone(source.job.runConfig);
          const model = settings.models[0]!;
          const rate = settings.modelPricing![model]!;
          const route = {
            provider: row.name,
            model,
            costStatus: 'known' as const,
            costPer1kInput: rate.costPer1kInput,
            costPer1kOutput: rate.costPer1kOutput,
            costCurrency: rate.costCurrency,
            pricingVersion: 'isolated-frozen-zero-rate',
          };
          experiment =
            capturedSample?.experiment ??
            (await createDiscoveryExperiment(
              db,
              {
                contractVersion: 1,
                name: '投入上限真实验收 ' + sample.id,
                sourceMode: 'discovery',
                discoveryScope: {
                  executionInstrument: source.version.schema.executionInstrument,
                  primaryTimeframe: '1d',
                },
                models: [{ provider: row.name, model }],
                acknowledgeUnknownCost: false,
                objective: { mode: 'balanced', minClosedTrades: 0 },
                split: {
                  development: { start: '2025-11-12', end: '2026-03-12' },
                  validation: { start: '2026-03-13', end: '2026-07-13' },
                  test: { start: '2026-07-14', end: '2026-11-12' },
                },
                budget: {
                  maxAiCalls: 1,
                  maxBacktestRuns: 6,
                  maxInputTokens: 100000,
                  maxOutputTokens: 20000,
                  maxDurationSeconds: 1800,
                },
                maxRounds: 1,
                idempotencyKey: 'isolated-investment:' + randomUUID(),
                runConfig: config,
              },
              [route],
            ));
          await db.$executeRaw(
            Prisma.sql`UPDATE "OptimizationExperiment" SET "status"='running', "stage"='proposing', "executionAttempt"=1 WHERE "id"=${experiment.id}::uuid`,
          );
          experiment = {
            ...experiment,
            status: 'running',
            stage: 'proposing',
            executionAttempt: 1,
          };
          const baselineVersion = await db.strategyVersion.findUniqueOrThrow({
            where: { id: experiment.baselineStrategyVersionId },
          });
          const seed = structuredClone(baselineVersion.schema) as BacktestStrategy;
          seed.cost = {
            commissionRate: '0.001',
            slippageRate: '0.01',
            minimumCommission: { amount: '10', currency: 'HKD' },
          };
          await db.strategyVersion.update({
            where: { id: baselineVersion.id },
            data: { schema: seed as Prisma.InputJsonValue },
          });
          const baseline = { ...baselineVersion, schema: seed as Prisma.JsonValue, strategy: seed };
          let proposal: OptimizationDiscoveryProposal;
          if (capturedSample) proposal = capturedSample.proposal;
          else if (live) {
            const generated = await candidates.generateProposal(experiment, baseline, [], route, 1);
            assert(!generated.continuationBlockedReason, generated.continuationBlockedReason ?? '');
            proposal = generated.proposal as OptimizationDiscoveryProposal;
          } else
            proposal = {
              strategy: controlledInvestmentStrategy(source.version.schema, sample.id),
              evidenceRefs: [],
            };
          const strategy = proposal.strategy as BacktestStrategy;
          write(sample.id + '-configuration.json', {
            intent,
            strategy,
            readback: backtestStrategyPlanReadback(strategy),
          });
          verifyInvestmentPlan(sample.id, strategy);
          // 专用验收复用正式候选写入接缝；完整冻结区间不冒充三段绩效优选。
          const persistence = candidates as unknown as {
            insertCandidate: (
              e: ExperimentRow,
              b: StrategyVersionRecord & { strategy: BacktestStrategy },
              descriptors: [],
              modelKey: string,
              p: OptimizationDiscoveryProposal,
              s: BacktestStrategy,
              hash: string,
            ) => Promise<CandidateRow>;
          };
          const candidate = await persistence.insertCandidate(
            experiment,
            baseline,
            [],
            row.name + ':' + model,
            proposal,
            strategy,
            optimizationSha256(strategy),
          );
          const saved = await db.strategyVersion.findUniqueOrThrow({
            where: { id: candidate.candidateStrategyVersionId },
          });
          expect(saved.schema).toEqual(strategy);
          const runId = randomUUID();
          const snapshot = await investmentSnapshot(
            source,
            resolve(output, sample.id + '-snapshot'),
            runId,
            saved.id,
            strategy,
          );
          const job = await db.backtestJob.create({
            data: {
              id: runId,
              strategyVersionId: saved.id,
              mode: 'V3',
              status: 'running',
              executionAttempt: 1,
              periodStart: new Date(config.startDate),
              periodEnd: new Date(config.endDate),
              dataAsOf: new Date(config.dataAsOf),
              input: {
                schemaVersion: '3',
                contractVersion: 1,
                strategyVersionId: saved.id,
                snapshotId: snapshot.manifest.contentHash!,
                snapshotVersion: snapshot.manifest.manifestVersion,
                runConfig: snapshot.config,
              } as Prisma.InputJsonValue,
              runConfig: snapshot.config as unknown as Prisma.InputJsonValue,
              snapshotId: snapshot.manifest.contentHash!,
              snapshotManifest: snapshot.manifest as unknown as Prisma.InputJsonValue,
            },
          });
          const executed = await executeBacktestV3Run({
            job,
            runner: snapshot.runner,
            snapshots: snapshot.store,
            signal: new AbortController().signal,
          });
          expect(await snapshot.run()).toEqual(executed.result);
          const verification = verifyInvestmentFills(
            strategy,
            snapshot.rows,
            executed.result.simulationFills,
            config.initialCash.HKD!,
          );
          if (sample.id === 'add') assert(verification.additions > 0, '未触发真实加仓');
          if (sample.id === 'volatility') {
            assert(verification.dynamicBuys > 0, '未验证低于最高比例的动态目标');
            assert(
              executed.result.simulationFills.some((f) => f.side === 'sell'),
              '没有主动减仓',
            );
          }
          await db.backtestJob.update({
            where: { id: runId },
            data: {
              status: 'succeeded',
              result: executed.result as unknown as Prisma.InputJsonValue,
              resultChecksum: executed.resultChecksum,
              engineVersion: snapshot.runner.id,
              finishedAt: new Date(),
            },
          });
          await db.$executeRaw(
            Prisma.sql`UPDATE "OptimizationCandidate" SET "validationStatus"='valid', "runRefs"=${JSON.stringify({ fullWindowAudit: runId })}::jsonb, "metrics"=${JSON.stringify({ investmentBudgetAudit: { checkedBuys: verification.checkedBuys, violations: 0 } })}::jsonb WHERE "id"=${candidate.id}::uuid`,
          );
          await db.$executeRaw(
            Prisma.sql`UPDATE "OptimizationExperiment" SET "status"='succeeded', "stage"='completed', "stopReason"='隔离全区间资金约束验收完成；未执行三段绩效优选', "leaseUntil"=NULL WHERE "id"=${experiment.id}::uuid`,
          );
          write(sample.id + '-audit.json', {
            capturedGeneration: capturedSample
              ? {
                  aiRunId: capturedSample.aiRunId,
                  strategyHash: capturedSample.strategyHash,
                  source: capture,
                }
              : undefined,
            strategy,
            result: executed.result,
            verification,
            sameFrozenRows: true,
            executionRowsHash: source.executionRowsHash,
            comparableDataFingerprint: snapshot.manifest.comparableDataFingerprint,
          });
          results.push({
            id: sample.id,
            status: 'passed',
            experimentId: experiment.id,
            candidateId: candidate.id,
            versionId: saved.id,
            runId,
            checkedBuys: verification.checkedBuys,
            additions: verification.additions,
            dynamicBuys: verification.dynamicBuys,
          });
          console.log(JSON.stringify(results.at(-1)));
        } catch (error) {
          const result = {
            id: sample.id,
            status: 'failed',
            experimentId: experiment?.id,
            error: String(error),
            stack: (error as Error).stack,
          };
          write(sample.id + '-failure.json', result);
          results.push(result);
          if (experiment)
            await db.$executeRaw(
              Prisma.sql`UPDATE "OptimizationExperiment" SET "status"='failed', "stage"='failed', "stopReason"=${String(error).slice(0, 1000)}, "leaseUntil"=NULL WHERE "id"=${experiment.id}::uuid`,
            );
          console.log(JSON.stringify({ id: sample.id, status: 'failed', error: String(error) }));
        }
      }
    } finally {
      promptSpy.mockRestore();
      const experiments =
        await db.$queryRaw`SELECT * FROM "OptimizationExperiment" ORDER BY "createdAt"`;
      const candidates =
        await db.$queryRaw`SELECT * FROM "OptimizationCandidate" ORDER BY "createdAt"`;
      const attempts = await db.$queryRaw`SELECT * FROM "OptimizationAttempt" ORDER BY "createdAt"`;
      write('records.json', {
        experiments,
        candidates,
        attempts,
        strategies: await db.strategy.findMany(),
        versions: await db.strategyVersion.findMany(),
        runs: await db.backtestJob.findMany(),
        aiRuns: await db.aiRun.findMany(),
      });
      write('receipt.json', {
        live,
        calls,
        generationContract: aiGenerationContracts.strategyDiscovery.ref,
        requestPolicy: {
          selectedCases: selectedCases.map((sample) => sample.id),
          requestCeilingMs: requestCeiling,
          maxCalls: selectedCases.length,
          automaticRetry: false,
        },
        capturedSource: captured
          ? { source: captured.source, recordsHash: captured.recordsHash }
          : undefined,
        sourceRunId: source.job.id,
        executionRowsHash: source.executionRowsHash,
        results,
      });
      await db.$disconnect();
    }
    expect(results).toHaveLength(captured?.samples.length ?? selectedCases.length);
    expect(results.every((r) => r.status === 'passed')).toBe(true);
    expect(calls).toBe(live ? selectedCases.length : 0);
  },
  900000,
);
