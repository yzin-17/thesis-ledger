import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { AUTHORING_LIMITS, type BacktestStrategy } from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { practicalV6IntentReview } from './practical-v6-intent-oracle.fixture.js';
import { validateGenerationRequest } from '../../src/ai/ai-generation-output.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { assembleDiscoveryGeneration } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { RESEARCH_STRATEGY_SPACE_VERSION } from '../../src/strategy-optimization/strategy-optimization-research.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { tradePlanProvider } from './trade-plan-provider.fixture.js';
import { restoreExpressionQualification } from './strategy-expression-qualification.fixture.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { practicalV6Input } from './practical-v6-input.fixture.js';
import { practicalV6Samples, practicalV6Request } from './practical-v6-request.fixture.js';
import { practicalV6Budget } from './practical-v6-live-budget.fixture.js';

const preview = process.env.PRACTICAL_V6_PREVIEW_DIR;
const replay = process.env.PRACTICAL_V6_REPLAY_DIR;
const live = !preview && process.env.PRACTICAL_V6_MODEL_LIVE === '1';
it.skipIf(!preview && !live && !replay)(
  'V6七例：冻结预检或已授权十次上限的真实验收',
  async () => {
    const directory = resolve(preview ?? process.env.BACKTEST_PLAN_ACCEPTANCE_DIR!);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const write = (name: string, value: unknown) => {
      const path = resolve(directory, name);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    };
    const maximum = Number(process.env.PRACTICAL_V6_CALL_LIMIT ?? 10);
    const budget = practicalV6Budget(
      directory,
      live,
      maximum,
      process.env.PRACTICAL_V6_AUTHORIZATION_REF,
    );
    const selected = process.env.PRACTICAL_V6_CASES?.split(',');
    const samples = practicalV6Samples.filter(
      (sample) => !selected || selected.includes(sample.id),
    );
    expect(samples.length).toBe(selected?.length ?? 7);
    if (replay) {
      expect(live).toBe(false);
      expect(resolve(replay)).toContain('/var/acceptance/');
    }
    const dbUrl = live || replay ? new URL(process.env.AI_PROVIDER_DATABASE_URL!) : null;
    if (dbUrl) {
      expect(dbUrl.hostname).toBe('127.0.0.1');
      expect(dbUrl.pathname).toBe('/ai_provider_concurrency_fixture');
    }
    const db = dbUrl ? new PrismaService({ datasourceUrl: dbUrl.href }) : null;
    const providerRow = live
      ? JSON.parse(readFileSync(resolve(directory, 'provider.json'), 'utf8'))
      : null;
    const qualified = new Map<string, Awaited<ReturnType<typeof tradePlanProvider>>>();
    const failedPurposes = new Set<string>();
    const receipts: { id: string; category: string; phase?: string; message?: string }[] = [];
    let completeWire = false;
    try {
      // 整批七例先完成数据、正式合同及冻结Runner预检，期间禁止网络。
      const inputs = [];
      for (const sample of samples) {
        const frozen = await practicalV6Input(
          resolve(directory, sample.id + '-inputs'),
          sample.kind,
          replay ? resolve(replay, sample.id + '-inputs') : undefined,
        );
        const experiment = {
          sourceMode: 'discovery',
          discoveryScope: frozen.scope,
          runConfig: frozen.runConfig,
          objective: { mode: 'return', minClosedTrades: 0 },
          strategySpaceVersion: RESEARCH_STRATEGY_SPACE_VERSION,
        } as ExperimentRow;
        const request = await practicalV6Request(sample, experiment, frozen.seed);
        if (replay) {
          const recorded = JSON.parse(
            readFileSync(resolve(replay, sample.id + '-input.json'), 'utf8'),
          );
          request.messages = recorded.messages;
          request.promptVersion = recorded.promptVersion ?? 'historical-recorded-messages';
          request.operation = recorded.operation;
        }
        validateGenerationRequest({
          requestId: 'preview',
          adapter: 'openai-compatible-chat',
          contract: request.contract.ref,
          schema: request.schema,
          messages: request.messages,
          mode: 'native_schema',
        });
        write(sample.id + '-input.json', {
          sample,
          contract: request.contract.ref,
          operation: request.operation,
          promptVersion: request.promptVersion,
          messages: request.messages,
          dataScope: frozen.runConfig.priceResearch?.dataScope,
        });
        inputs.push({ sample, frozen, experiment, ...request });
      }
      for (const input of inputs) {
        const { sample, frozen, experiment, contract, operation, schema, messages } = input;
        if (!live && !replay) {
          receipts.push({ id: sample.id, category: 'preview_validated' });
          continue;
        }
        if (failedPurposes.has(sample.entry)) {
          receipts.push({ id: sample.id, category: 'purpose_stopped' });
          continue;
        }
        let phase = 'qualification';
        completeWire = false;
        let sentBefore = budget.sent;
        let generation, definition: BacktestStrategy | undefined, compilation: unknown;
        try {
          if (replay)
            generation = JSON.parse(
              readFileSync(resolve(replay, sample.id + '.json'), 'utf8'),
            ).generation;
          else {
            let provider = qualified.get(sample.entry);
            if (!provider) {
              const cachedRoot = process.env.PRACTICAL_V6_QUALIFICATION_DIR;
              if (cachedRoot) {
                expect(resolve(cachedRoot)).toContain('/var/acceptance/');
                const cached = JSON.parse(
                  readFileSync(resolve(cachedRoot, sample.entry + '.json'), 'utf8'),
                );
                const current = parseAiProviderSettings(providerRow.settings)!;
                const stored = parseAiProviderSettings(cached.settings)!;
                const route = current.executionRoutes!.find(
                  (route) =>
                    route.model === stored.models[0] && route.contract.id === contract.ref.id,
                )!;
                expect({
                  ...current,
                  executionRoutes: [
                    {
                      ...route,
                      contract: contract.ref,
                      outputPolicy: 'manual',
                      modeOverridden: true,
                    },
                  ],
                }).toEqual(stored);
                provider = await restoreExpressionQualification(
                  cached,
                  sample.entry,
                  (name, value) => {
                    if (name.startsWith('wire-output-')) {
                      completeWire = true;
                      budget.complete();
                    }
                    write(sample.entry + '/' + name, value);
                  },
                );
              } else {
                budget.begin(sample.entry + '/probe');
                provider = await tradePlanProvider(
                  providerRow,
                  (name, value) => {
                    if (name.startsWith('wire-output-')) {
                      completeWire = true;
                      budget.complete();
                    }
                    write(sample.entry + '/' + name, value);
                  },
                  sample.entry,
                );
              }
              qualified.set(sample.entry, provider);
              budget.complete();
            }
            phase = 'generation';
            completeWire = false;
            sentBefore = budget.sent;
            budget.begin(sample.id);
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
            budget.complete();
            phase = 'formal_validation';
          }
          phase = 'formal_validation';
          if (sample.entry === 'discovery')
            definition = assembleDiscoveryGeneration(
              experiment,
              frozen.seed,
              generation.output,
              (result) => {
                compilation = result;
              },
            ).strategy;
          else {
            const validated =
              sample.entry === 'authoring-modification'
                ? validateAuthoringModification(
                    operation!.input.content,
                    operation!.input.selection,
                    generation.output,
                  )
                : validateAuthoringGeneration(
                    operation!.input.content,
                    generation.output,
                  );
            definition = validated.definition;
            compilation = 'compilation' in validated ? validated.compilation : undefined;
          }
          if (!replay) {
            phase = 'intent_validation';
            const baseline = sample.entry === 'authoring-modification'
              ? JSON.parse(operation!.input.content.definitionText) as BacktestStrategy : undefined;
            const intent = practicalV6IntentReview(sample.id, definition, baseline);
            write(sample.id + '-intent.json', intent);
            if (!intent.passed) throw new Error('BUSINESS_INTENT_MISMATCH: ' + intent.issues.map((issue) => issue.path).join(', '));
          }
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
          const snapshot = await frozen.freeze(
            resolve(directory, sample.id + '-snapshot'),
            definition,
          );
          const result = await snapshot.run();
          expect(await snapshot.run()).toEqual(result);
          write(sample.id + '.json', {
            category: 'formal_vertical_validated',
            generation,
            definition,
            compilation,
            readback: backtestStrategyPlanReadback(definition),
            result,
            semanticReview: '待逐项对照原始自然语言',
          });
          receipts.push({ id: sample.id, category: 'formal_vertical_validated' });
        } catch (error) {
          const failure = { id: sample.id, category: 'failed', phase, message: String(error) };
          write(sample.id + '.json', {
            ...failure,
            generation,
            definition,
            compilation,
            diagnostics:
              (error as { compilation?: unknown; response?: unknown }).compilation ??
              (error as { response?: unknown }).response,
          });
          receipts.push(failure);
          if (phase === 'qualification') failedPurposes.add(sample.entry);
          if (['qualification', 'generation'].includes(phase) && !completeWire && budget.sent > sentBefore) {
            budget.unknown();
            break;
          }
          if (phase === 'generation' && !completeWire) break;
        }
      }
      write('receipt.json', {
        previewOnly: !live && !replay,
        replayOf: replay,
        sent: budget.sent,
        maximum,
        receipts,
      });
      expect(receipts.length).toBe(samples.length);
      if (replay) {
        expect(budget.sent).toBe(0);
        expect(receipts.map(({ id, category, phase }) => ({ id, category, phase }))).toEqual([
          { id: 'count-confirmation', category: 'failed', phase: 'frozen_replay' },
          { id: 'statistics-gap', category: 'failed', phase: 'formal_validation' },
          { id: 'captured-retest', category: 'formal_vertical_validated', phase: undefined },
          { id: 'timeframes-anchor', category: 'failed', phase: 'formal_validation' },
          { id: 'session-vwap-arithmetic', category: 'failed', phase: 'formal_validation' },
          { id: 'hfq-only-discovery', category: 'formal_vertical_validated', phase: undefined },
          { id: 'stop-only-policy', category: 'formal_vertical_validated', phase: undefined },
        ]);
      } else
        expect(
          receipts.every((item) =>
            ['formal_vertical_validated', 'preview_validated'].includes(item.category),
          ),
        ).toBe(true);
    } finally {
      budget.restore();
      await db?.$disconnect();
    }
  },
  5_400_000,
);
