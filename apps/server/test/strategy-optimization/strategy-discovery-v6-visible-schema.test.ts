import { expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { equivalentGenerationSchemas } from '../ai/generation-schema-equivalence.fixture.js';
import { aiGenerationContracts, generatedBooleanExpressionV6Schema } from '@thesis-ledger/schemas';
import { buildGenerationSchemaPrompt, buildDiscoveryTextSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';
import { backtestGenerationGuideV6 } from '@thesis-ledger/domain';
import {
  generationInputBytes,
  generationOutput,
  validateGenerationRequest,
} from '../../src/ai/ai-generation-output.js';
import { prepareOptimizationGeneration } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { priceResearchFixture } from '../backtest/price-research.fixtures.js';
import { RESEARCH_STRATEGY_SPACE_VERSION } from '../../src/strategy-optimization/strategy-optimization-research.js';

it('现行原生探索通过响应格式提供完整 Schema，并在预留前计入实际请求', async () => {
  const f = await priceResearchFixture();
  const scope = {
    executionInstrument: f.input.strategy.executionInstrument,
    primaryTimeframe: '1d' as const,
  };
  const strategy = createDiscoverySeed(scope, true);
  const result = await prepareBacktestRunConfigV3({
    request: f.request,
    strategy,
    reader: f.reader,
    control: f.control,
    checkedAt: f.input.runConfig.dataAsOf,
  });
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const input = {
    prisma: { $queryRaw: vi.fn(async () => []) } as never,
    experiment: {
      id: '11111111-1111-4111-8111-111111111111',
      sourceMode: 'discovery',
      discoveryScope: scope,
      runConfig: result.runConfig,
      objective: { mode: 'balanced', minClosedTrades: 0 },
      allowedParameterIds: [],
      strategySpaceVersion: RESEARCH_STRATEGY_SPACE_VERSION,
    } as never,
    strategy,
    descriptors: [],
    modelKey: 'fixture',
    round: 1,
    useSdkContract: true,
    generationMode: 'native_schema' as const,
  };
  const prepared = await prepareOptimizationGeneration(input);
  const text = await prepareOptimizationGeneration({ ...input, generationMode: 'json_validated' });
  const contract = aiGenerationContracts.strategyDiscovery;
  const schemaPrompt = buildDiscoveryTextSchemaPrompt(contract.schema);
  expect(text.messages[0]!.content).toContain(schemaPrompt);
  expect(prepared.messages[0]!.content).not.toContain('OUTPUT_JSON_SCHEMA');
  const request = JSON.parse(prepared.messages[1]!.content.replace('DISCOVERY_REQUEST_JSON:', ''));
  expect(request.dataScope).toEqual(result.runConfig.priceResearch?.dataScope);
  expect(prepared.messages[0]!.content).not.toContain(JSON.stringify(request.dataScope));
  const guide = backtestGenerationGuideV6(result.runConfig.priceResearch?.dataScope?.sources);
  expect(prepared.messages[0]!.content).toContain(guide);
  expect(guide).toContain('consecutive内的gt读“连续多根每根收盘分别高于当根指标”');
  const reference = guide.split('\n').find((line) => line.startsWith('EXPRESSION_V6_REFERENCE_JSON:'))!;
  for (const expression of Object.values(JSON.parse(reference.replace('EXPRESSION_V6_REFERENCE_JSON:', ''))))
    expect(generatedBooleanExpressionV6Schema.safeParse(expression).success).toBe(true);
  const jsonPrompt = buildGenerationSchemaPrompt(contract.schema, 'ref');
  expect(equivalentGenerationSchemas(JSON.parse(jsonPrompt.split('OUTPUT_JSON_SCHEMA:')[1]!),
    parseYaml(schemaPrompt.split('OUTPUT_JSON_SCHEMA_YAML:')[1]!))).toBe(true);
  const verbose = text.messages.map((message) => ({ ...message, content: message.content.replace(schemaPrompt, jsonPrompt) }));
  expect(text.inputTokenReservation).toBeLessThan(await generationInputBytes(verbose, 'json_validated', contract.schema, contract.ref));
  const format = await generationOutput('native_schema', contract.schema, contract.ref).responseFormat;
  if (format?.type !== 'json') throw new Error('缺少原生输出合同');
  expect(JSON.stringify(format.schema)).toContain('上穿和下穿只用于cross');
  const previous = JSON.parse(await readFile(new URL('../../../../packages/schemas/fixtures/strategy-discovery-v6.before-operator-order.schema.json', import.meta.url), 'utf8'));
  expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe('9085d3677a8d2f02cd3952ef512119783d9083d5ab9efea78e3cdd7910b85dd2');
  expect(equivalentGenerationSchemas(previous, JSON.parse(JSON.stringify(format.schema)))).toBe(true);
  expect(prepared.messages[0]!.content).toContain(
    'OUTPUT_CONTRACT:strategy_discovery/strategy-discovery-generation-v1',
  );
  for (const operator of [
    'countTrue',
    'consecutive',
    'quantile',
    'capture',
    'percentOfEquity',
    'sessionValue',
  ])
    expect(schemaPrompt).toContain(operator);
  expect(prepared.inputTokenReservation).toBe(
    await generationInputBytes(prepared.messages, 'native_schema', contract.schema, contract.ref),
  );
  expect(prepared.inputTokenReservation).toBe(
    Buffer.byteLength(JSON.stringify(prepared.messages)) + Buffer.byteLength(JSON.stringify(format)),
  );
  expect(() =>
    validateGenerationRequest({
      requestId: 'fixture',
      adapter: 'openai-compatible-chat',
      contract: contract.ref,
      schema: contract.schema,
      messages: prepared.messages,
      mode: 'native_schema',
    }),
  ).not.toThrow();
});

it('探索算子示例按冻结周期和字段选择，同时保留无行情依赖的规则', () => {
  const references = (guide: string) => JSON.parse(
    guide.split('\n').find((line) => line.startsWith('EXPRESSION_V6_REFERENCE_JSON:'))!
      .replace('EXPRESSION_V6_REFERENCE_JSON:', ''),
  );
  const daily = { timeframe: '1d', fields: ['open', 'high', 'close'] } as const;
  const priceOnly = references(backtestGenerationGuideV6([{ ...daily, fields: [...daily.fields] }]));
  expect(Object.keys(priceOnly)).toEqual([
    'noOrdinaryExit', 'flat', 'count', 'mixedComparisonBoundaries', 'consecutive', 'frozenBreakout',
  ]);
  const withVolume = references(backtestGenerationGuideV6([
    { ...daily, fields: [...daily.fields, 'volume'] },
    { timeframe: '60m', fields: ['close'] },
    { timeframe: '1m', fields: ['close', 'volume'] },
  ]));
  for (const example of ['latestHour', 'previousDailyCumulative', 'sessionDeviation'])
    expect(generatedBooleanExpressionV6Schema.safeParse(withVolume[example]).success).toBe(true);
});
