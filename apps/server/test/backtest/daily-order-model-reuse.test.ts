import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { aiGenerationContracts, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { prepareOptimizationGeneration } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { dailyModelCases } from './daily-order-model.fixture.js';

const capture = process.env.BACKTEST_DAILY_REUSE_CAPTURE_DIR;
it.skipIf(!capture)('相同发现输入复用原失败证据，不为不同行情矩阵重复调用模型', async () => {
  const root = resolve(capture!);
  const read = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
  const source = read('each-fill-input.json');
  const original = read('request-6.json');
  const wire = read('wire-6-1.json');
  const receipt = read('each-fill.json');
  const contract = aiGenerationContracts.strategyDiscovery;
  const prepared = await prepareOptimizationGeneration({
    prisma: { $queryRaw: async () => [] } as never,
    experiment: source.experiment,
    strategy: strategySchema.parse(source.seed) as BacktestStrategy,
    descriptors: [], modelKey: '复用核对', round: 1, useSdkContract: true, generationMode: 'native_schema',
  });
  const sample = dailyModelCases.find(s => s.id === 'two-bars')!;
  const messages = [...prepared.messages, { role: 'user' as const, content: sample.intent }];
  expect(messages).toEqual(original.messages);
  const format = await generationOutput('native_schema', contract.schema, contract.ref).responseFormat;
  if (format?.type !== 'json') throw new Error('缺少原生输出格式');
  expect(format.schema).toEqual(wire.responseFormat.json_schema.schema);
  expect(original.mode).toBe('native_schema');
  expect(original.contract).toEqual(contract.ref);
  expect(receipt.category).toBe('model_generation_or_schema_failed');
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  writeFileSync(resolve(root, 'reuse-two-bars.json'), JSON.stringify({
    sample: sample.id, reusedFrom: 'each-fill', newModelCalls: 0,
    messagesEqual: true, nativeSchemaEqual: true, messagesSha256: digest(messages), nativeSchemaSha256: digest(format.schema),
    category: receipt.category, originalResponse: 'response-6.json',
    boundary: '复用同一输入的原始失败，不声称新调用或执行通过；该配置未进入 Worker。',
  }, null, 2), { mode: 0o600, flag: 'wx' });
});
