import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { aiGenerationContracts, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { dailyModelCases, dailyModelIssues, dailyModelExecutionIssues } from './daily-order-model.fixture.js';

const output = process.env.BACKTEST_DAILY_REVIEW_DIR;
it.skipIf(!output)('零调用复核当前合同、原始请求、配置中文与成对结果，保留所有失败', async () => {
  const directory = resolve(output!), root = resolve(directory, '..');
  mkdirSync(directory, { mode: 0o700 });
  const batches = [
    { entry: 'discovery', name: 'backtest-daily-orders-discovery-native-20261117', ids: dailyModelCases.map(c => c.id) },
    { entry: 'authoring', name: 'backtest-daily-orders-authoring-native-a-20261117', ids: ['limit', 'market', 'touch', 'close'] },
    { entry: 'authoring', name: 'backtest-daily-orders-authoring-native-b-20261117', ids: ['each-fill', 'full-fill', 'day', 'two-bars'] },
    { entry: 'authoring-modification', name: 'backtest-daily-orders-modification-native-a-20261117', ids: ['limit', 'market', 'touch', 'close'] },
    { entry: 'authoring-modification', name: 'backtest-daily-orders-modification-native-b-20261117', ids: ['each-fill', 'full-fill', 'day', 'two-bars'] },
  ];
  const rows: Record<string, unknown>[] = [];
  let settings: unknown, requests = 0, responses = 0, httpRequests = 0;
  for (const batch of batches) {
    const path = resolve(root, batch.name), read = (name: string) => JSON.parse(readFileSync(resolve(path, name), 'utf8'));
    const provider = read('provider.json');
    if (settings === undefined) settings = provider.settings;
    else expect(provider.settings).toEqual(settings);
    const files = readdirSync(path);
    requests += files.filter(f => /^request-\d+\.json$/.test(f)).length;
    responses += files.filter(f => /^response-\d+\.json$/.test(f)).length;
    httpRequests += files.filter(f => /^wire-\d+-\d+\.json$/.test(f)).length;
    const contract = { discovery: aiGenerationContracts.strategyDiscovery, authoring: aiGenerationContracts.authoringGeneration, 'authoring-modification': aiGenerationContracts.authoringModification }[batch.entry as 'discovery' | 'authoring' | 'authoring-modification'];
    let number = 1;
    for (const id of batch.ids) {
      if (!existsSync(resolve(path, id + '-input.json'))) {
        const reuse = read('reuse-two-bars.json');
        expect(reuse.sample).toBe(id);
        expect(reuse.messagesEqual && reuse.nativeSchemaEqual).toBe(true);
        rows.push({ entry: batch.entry, id, pair: 'validity', category: 'model_output_schema_invalid', reusedFrom: reuse.reusedFrom, newCalls: 0 });
        continue;
      }
      const input = read(id + '-input.json'), request = read(`request-${++number}.json`), wire = read(`wire-${number}-1.json`);
      expect(request.messages).toEqual(input.messages);
      expect(request.mode).toBe('native_schema');
      expect(request.contract).toEqual(contract.ref);
      expect(wire.model).toBe(provider.settings.models[0]);
      const schema = batch.entry === 'discovery' ? contract.schema : authoringOperationSchema(input.operation);
      const format = await generationOutput('native_schema', schema, contract.ref).responseFormat;
      if (format?.type !== 'json') throw new Error('缺少原生格式');
      expect(format.schema).toEqual(wire.responseFormat.json_schema.schema);
      const sample = dailyModelCases.find(c => c.id === id)!;
      const identity = { entry: batch.entry, id, pair: sample.pair, nativeSchemaSha256: createHash('sha256').update(JSON.stringify(format.schema)).digest('hex') };
      if (!existsSync(resolve(path, id + '.json'))) {
        expect(existsSync(resolve(path, `response-${number}.json`))).toBe(false);
        rows.push({ ...identity, category: 'generation_outcome_unknown', automaticRetry: false });
        continue;
      }
      const receipt = read(id + '.json');
      let category = receipt.category, intentIssues: string[] = [], executionIssues: string[] = [];
      let currentReadback: string[] | undefined;
      if (receipt.configuration) {
        const configuration = strategySchema.parse(receipt.configuration) as BacktestStrategy;
        currentReadback = backtestStrategyPlanReadback(configuration);
        if (!isDeepStrictEqual(currentReadback, receipt.readback)) {
          expect(batch.entry === 'authoring-modification' && id === 'market').toBe(true);
          expect(configuration.execution).toMatchObject({ mode: 'exchange', orderType: 'market', timeInForce: 'DAY' });
          const validity = '委托有效期：当日有效；市价委托按现有整笔撮合规则成交或拒绝。';
          expect(currentReadback.filter(line => line !== validity)).toEqual(receipt.readback);
          expect(currentReadback.filter(line => line === validity)).toHaveLength(1);
        }
        if (receipt.savedVersionId && receipt.result) {
          intentIssues = dailyModelIssues(sample, configuration);
          executionIssues = dailyModelExecutionIssues(sample, receipt.result.simulationFills);
          if (intentIssues.length) category = 'model_selected_wrong_structure';
          else if (executionIssues.length) category = 'engine_execution_deviation';
          else category = 'passed';
          expect(receipt.replayEqual).toBe(true);
        }
      }
      if (receipt.fact?.code === 'schema_invalid') category = 'model_output_schema_invalid';
      else if (receipt.fact?.code === 'output_truncated') category = 'generation_truncated';
      rows.push({ ...identity, category, originalCategory: receipt.category, intentIssues, executionIssues, currentReadback, savedVersionId: receipt.savedVersionId, original: `${batch.name}/${id}.json` });
    }
  }
  const groups = ['discovery', 'authoring', 'authoring-modification'].map(entry => ({
    entry, samples: rows.filter(r => r.entry === entry).length,
    passed: rows.filter(r => r.entry === entry && r.category === 'passed').length,
    completePairs: ['order-kind', 'protection-timing', 'activation', 'validity'].filter(pair => rows.filter(r => r.entry === entry && r.pair === pair && r.category === 'passed').length === 2),
  }));
  const receipt = { newModelCalls: 0, actualAdapterRequests: requests, actualHttpRequests: httpRequests, completeResponses: responses, actualProviderSettingsEqual: true, groups, rows };
  writeFileSync(resolve(directory, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  expect(rows).toHaveLength(24);
  expect(requests).toBe(28);
  expect(responses).toBe(27);
  expect(httpRequests).toBe(28);
  console.log(JSON.stringify({ requests, responses, groups }));
});
