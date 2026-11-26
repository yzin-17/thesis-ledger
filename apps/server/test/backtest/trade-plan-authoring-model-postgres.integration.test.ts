import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import type { z } from 'zod';
import {
  aiGenerationContracts,
  AUTHORING_LIMITS,
  strategySchema,
  projectPriceResearchStrategy,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import {
  authoringMessages,
  AUTHORING_PROMPT_VERSION,
} from '../../src/strategy-authoring/authoring-prompt.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import {
  modelPlanConforms,
  modelExecutionConforms,
} from './trade-plan-model-evaluation.fixture.js';
import { tradePlanProvider } from './trade-plan-provider.fixture.js';
import {
  tradePlanModelScenario,
  modelScenarioSnapshot,
  modelScenarioModificationTarget,
} from './trade-plan-model-scenario.fixture.js';

const output = process.env.BACKTEST_PLAN_ACCEPTANCE_DIR;
function sampleId(trailing: boolean) {
  const cases = tradePlanModelScenario().cases;
  if (cases) return cases[Number(trailing)]!.id;
  return trailing ? 'trailing-stop' : 'fixed-stop';
}
function sampleSelection(input: {
  modifying: boolean;
  trailing: boolean;
  description: string;
  providerId: string;
  model: string;
  currency: AuthoringOperation['input']['selection']['cost']['currency'];
}): AuthoringOperation['input']['selection'] {
  const selection: AuthoringOperation['input']['selection'] = {
    kind: 'generate',
    intent: input.description,
    providerId: input.providerId,
    model: input.model,
    expectedRevision: 1,
    idempotencyKey: randomUUID(),
    promptVersion: AUTHORING_PROMPT_VERSION,
    capabilityVersion: 'authoring-v1',
    unknownCostAcknowledgedAt: null,
    cost: {
      status: 'estimated',
      amount: '0',
      currency: input.currency,
      source: 'configured_pricing',
      pricingVersion: null,
    },
  };
  if (!input.modifying) return selection;
  const intent = tradePlanModelScenario().modificationIntent(input.trailing);
  return {
    ...selection,
    kind: 'modify',
    modificationTarget: modelScenarioModificationTarget(),
    intent,
  };
}

function failureCategory(phase: string, signal: AbortSignal) {
  if (signal.aborted && signal.reason?.name === 'TimeoutError') return 'generation_timeout';
  if (phase === 'validation') return 'model_output_rejected';
  if (phase !== 'generation') return 'execution_or_persistence_failed';
  return 'generation_failed';
}

function sampleInput(
  trailing: boolean,
  modifying: boolean,
  previous: {
    beforeConfiguration?: BacktestStrategy;
    messages?: ReturnType<typeof authoringMessages>;
    intent?: string;
    inputOperation?: AuthoringOperation;
  } | null,
  provider: Pick<Parameters<typeof sampleSelection>[0], 'providerId' | 'model' | 'currency'>,
) {
  if (previous?.inputOperation) {
    const operation = previous.inputOperation;
    return {
      ...operation.input,
      operation,
      beforeConfiguration: previous.beforeConfiguration,
      messages: previous.messages ?? authoringMessages(operation),
      schema: authoringOperationSchema(operation),
    };
  }
  const scenario = tradePlanModelScenario();
  const content = scenario.content(modifying ? !trailing : trailing);
  let beforeConfiguration = modifying
    ? (previous?.beforeConfiguration ?? scenario.configuration(!trailing))
    : undefined;
  // 新模拟修改基线使用当前价格坐标。历史捕获保留当时的基线和请求。
  if (beforeConfiguration && !previous)
    beforeConfiguration = projectPriceResearchStrategy(beforeConfiguration);
  if (beforeConfiguration) content.definitionText = JSON.stringify(beforeConfiguration);
  const selection = sampleSelection({
    modifying,
    trailing,
    description: content.description,
    ...provider,
  });
  if (previous?.intent) selection.intent = previous.intent;
  const operation = { revision: 1, input: { content, selection } } as AuthoringOperation;
  return {
    content,
    beforeConfiguration,
    selection,
    operation,
    messages: previous?.messages ?? authoringMessages(operation),
    schema: authoringOperationSchema(operation),
  };
}

async function requestGeneration(
  qualified: Awaited<ReturnType<typeof tradePlanProvider>>,
  input: {
    providerId: string;
    model: string;
    messages: ReturnType<typeof authoringMessages>;
    schema: z.ZodType<unknown>;
    contract:
      | typeof aiGenerationContracts.authoringGeneration
      | typeof aiGenerationContracts.authoringModification;
    signal: AbortSignal;
  },
) {
  const { adapter, resolved } = qualified;
  const runtime = resolved.provider.sdkRuntime!();
  return adapter.generate({
    requestId: randomUUID(),
    adapter: resolved.execution.adapter,
    providerId: input.providerId,
    baseURL: runtime.baseURL,
    authMode: runtime.authMode ?? 'none',
    apiKey: runtime.apiKey,
    model: input.model,
    messages: input.messages,
    contract: input.contract.ref,
    schema: input.schema,
    mode: resolved.execution.mode,
    transport: 'stream',
    maxOutputTokens: AUTHORING_LIMITS.outputTokens,
    ...(resolved.execution.requestOptions
      ? { requestOptions: resolved.execution.requestOptions }
      : {}),
    timeout: { totalMs: AUTHORING_LIMITS.deadlineMs, firstChunkMs: 90000, chunkMs: 45000 },
    signal: input.signal,
  });
}

function resultCategory(
  id: string,
  configuration: BacktestStrategy,
  fills: Parameters<typeof modelExecutionConforms>[1],
) {
  if (!modelPlanConforms(id, configuration)) return 'model_selected_wrong_structure';
  if (!modelExecutionConforms(id, fills)) return 'engine_execution_deviation';
  return 'passed';
}

it.skipIf(!output)(
  '实际编写入口：确认文本→正式完整合同→校验保存→快照执行与中文',
  async () => {
    const captured = process.env.BACKTEST_PLAN_CAPTURE_DIR;
    const modifying = process.env.BACKTEST_PLAN_ENTRY === 'authoring-modification';
    const contract = modifying
      ? aiGenerationContracts.authoringModification
      : aiGenerationContracts.authoringGeneration;
    const directory = resolve(output!);
    const write = (name: string, value: unknown) =>
      writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
    const url = new URL(process.env.AI_PROVIDER_DATABASE_URL!);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname).toBe('/ai_provider_concurrency_fixture');
    const db = new PrismaService({ datasourceUrl: url.href });
    const results: { category: string }[] = [];
    try {
      const row = JSON.parse(readFileSync(resolve(directory, 'provider.json'), 'utf8'));
      const qualified = captured
        ? null
        : await tradePlanProvider(row, write, modifying ? 'authoring-modification' : 'authoring');
      const model = row.settings.models[0];
      const requested = process.env.BACKTEST_PLAN_CASES?.split(',');
      const samples = [false, true].filter(
        (trailing) => !requested || requested.includes(sampleId(trailing)),
      );
      expect(samples.length).toBeGreaterThan(0);
      for (const trailing of samples) {
        const id = sampleId(trailing);
        const previous = captured
          ? JSON.parse(readFileSync(resolve(captured, id + '.json'), 'utf8'))
          : null;
        const { content, beforeConfiguration, selection, messages, schema, operation } =
          sampleInput(trailing, modifying, previous, {
            providerId: row.name,
            model,
            currency: row.settings.modelPricing[model].costCurrency,
          });
        let generation: unknown,
          configuration: BacktestStrategy | undefined,
          phase = 'generation';
        const signal = AbortSignal.timeout(AUTHORING_LIMITS.deadlineMs);
        try {
          if (captured) {
            expect(previous.generation).toBeTruthy();
            generation = previous.generation;
          } else {
            generation = await requestGeneration(qualified!, {
              providerId: row.name,
              model,
              messages,
              schema,
              contract,
              signal,
            });
          }
          const candidate = strategySchema.safeParse(
            (generation as { output: { definition: unknown } }).output.definition,
          );
          if (candidate.success) configuration = candidate.data as BacktestStrategy;
          phase = 'validation';
          const checked = modifying
            ? validateAuthoringModification(
                content,
                selection,
                (generation as { output: unknown }).output,
              )
            : validateAuthoringGeneration(content, (generation as { output: unknown }).output);
          configuration = checked.definition;
          phase = 'persistence';
          const saved = await db.$transaction((tx) =>
            new StrategyCreationService().createInTransaction(tx, {
              ownerId: null,
              name: '独立编写模型 ' + id,
              definition: configuration,
              source: { kind: 'manual' },
            }),
          );
          expect(saved.versions[0]!.schema).toEqual(configuration);
          phase = 'execution';
          const snapshots = resolve(directory, id + '-snapshot');
          mkdirSync(snapshots, { mode: 0o700 });
          const fixture = await modelScenarioSnapshot(snapshots, configuration),
            result = await fixture.run();
          expect(await fixture.run()).toEqual(result);
          const execution = fixture.execute();
          const receipt = {
            id,
            category: resultCategory(id, configuration, execution.fills),
            configuration,
            readback: backtestStrategyPlanReadback(configuration),
            execution,
            result,
            ...(modifying
              ? {
                  beforeConfiguration,
                  differences: (checked as ReturnType<typeof validateAuthoringModification>)
                    .differences,
                }
              : {}),
          };
          write(id + '.json', {
            intent: selection.intent,
            inputOperation: operation,
            messages,
            generation,
            ...receipt,
          });
          results.push(receipt);
        } catch (error) {
          const receipt = {
            id,
            category: failureCategory(phase, signal),
            phase,
            message: String(error),
            generation,
            configuration,
            readback: configuration ? backtestStrategyPlanReadback(configuration) : [],
          };
          write(id + '.json', {
            intent: selection.intent,
            inputOperation: operation,
            messages,
            beforeConfiguration,
            ...receipt,
          });
          results.push(receipt);
        }
      }
      write('receipt.json', {
        calls: captured ? 0 : samples.length + 1,
        capturedSource: captured ?? null,
        model,
        providerWrites: 0,
        historicalWrites: 0,
        results,
      });
      expect(results.every((r) => r.category === 'passed')).toBe(true);
    } finally {
      await db.$disconnect();
    }
  },
  600000,
);
