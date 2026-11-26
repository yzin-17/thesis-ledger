import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { aiGenerationContracts, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import { dailyModelCases, dailyModelIssues, dailyModelExecutionIssues } from './daily-order-model.fixture.js';

const output = process.env.BACKTEST_DAILY_CURRENT_REVIEW_DIR;
const prefix = process.env.BACKTEST_DAILY_CURRENT_CAPTURE_PREFIX;
type Validator = ((value: unknown) => boolean) & { errors?: unknown[] };

it.skipIf(!output || !prefix)('当前六批实际捕获：核对原生参数、消息、拒绝层次及合格配置中文', async () => {
  const directory = resolve(output!), root = dirname(directory);
  mkdirSync(directory, { mode: 0o700 });
  const require = createRequire(import.meta.url);
  const Ajv = require(require.resolve('ajv', { paths: [require.resolve('eslint')] })) as new (options: object) => { compile: (schema: unknown) => Validator };
  const rows: Record<string, unknown>[] = [];
  let settings: unknown, requests = 0, responses = 0, httpRequests = 0;
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const entry of ['discovery', 'authoring', 'authoring-modification'] as const) {
    for (const [index, batch] of ['a', 'b'].entries()) {
      const name = `${prefix}-${entry.replace('authoring-', '')}-${batch}-20261117`;
      const path = resolve(root, name);
      const read = (file: string) => JSON.parse(readFileSync(resolve(path, file), 'utf8'));
      const provider = read('provider.json');
      if (settings === undefined) settings = provider.settings;
      else expect(provider.settings).toEqual(settings);
      const files = readdirSync(path);
      requests += files.filter(f => /^request-\d+\.json$/.test(f)).length;
      responses += files.filter(f => /^response-\d+\.json$/.test(f)).length;
      httpRequests += files.filter(f => /^wire-\d+-\d+\.json$/.test(f)).length;
      const contract = { discovery: aiGenerationContracts.strategyDiscovery, authoring: aiGenerationContracts.authoringGeneration, 'authoring-modification': aiGenerationContracts.authoringModification }[entry];
      const samples = dailyModelCases.slice(index * 4, index * 4 + 4);
      for (const [i, sample] of samples.entries()) {
        const call = i + 2;
        const input = read(sample.id + '-input.json'), request = read(`request-${call}.json`), wire = read(`wire-${call}-1.json`);
        const raw = read(`wire-output-${call}-1.json`), receipt = read(sample.id + '.json');
        expect(request.messages).toEqual(input.messages);
        expect(request.mode).toBe('native_schema');
        expect(request.contract).toEqual(contract.ref);
        expect(contract.ref.version).toMatch(/-v5$/);
        expect(request.maxOutputTokens).toBe(entry === 'discovery' ? 16384 : 8192);
        expect(wire.model).toBe(provider.settings.models[0]);
        expect(wire.messages).toEqual(request.messages.map((message: { role: string; content: unknown }) => ({ role: message.role, contentBytes: Buffer.byteLength(JSON.stringify(message.content)), contentSha256: digest(message.content) })));
        const schema = entry === 'discovery' ? contract.schema : authoringOperationSchema(input.operation);
        const format = await generationOutput('native_schema', schema, contract.ref).responseFormat;
        if (format?.type !== 'json') throw new Error('缺少原生参数');
        expect(wire.responseFormat.json_schema.strict).toBe(true);
        expect(wire.responseFormat.json_schema.schema).toEqual(format.schema);
        const native = new Ajv({ allErrors: true, strictKeywords: true }).compile(format.schema);
        const complete = raw.finalJsonAvailable !== false;
        const nativeAccepted = complete && native(raw);
        const final = schema.safeParse(raw);
        if (receipt.category === 'passed') {
          expect(nativeAccepted && final.success).toBe(true);
          const configuration = strategySchema.parse(receipt.configuration) as BacktestStrategy;
          expect(dailyModelIssues(sample, configuration)).toEqual([]);
          expect(dailyModelExecutionIssues(sample, receipt.result.simulationFills)).toEqual([]);
          expect(receipt.savedVersionId).toBeTruthy();
          expect(receipt.replayEqual).toBe(true);
        }
        if (receipt.configuration) expect(backtestStrategyPlanReadback(receipt.configuration)).toEqual(receipt.readback);
        if (receipt.category === 'model_selected_wrong_structure') {
          expect(receipt.intentIssues.length).toBeGreaterThan(0);
          expect(receipt.savedVersionId).toBeUndefined();
          expect(receipt.result).toBeUndefined();
        }
        rows.push({ entry, id: sample.id, pair: sample.pair, original: `${name}/${sample.id}.json`, category: receipt.category, complete, nativeAccepted, generationZodAccepted: final.success,
          factCode: receipt.fact?.code, diagnostic: receipt.fact?.diagnostic, nativeErrors: native.errors,
          finalErrors: final.success ? [] : final.error.issues, intentIssues: receipt.intentIssues,
          readback: receipt.readback, replayEqual: receipt.replayEqual, messagesSha256: digest(request.messages), nativeSchemaSha256: digest(format.schema) });
      }
    }
  }
  const groups = ['discovery', 'authoring', 'authoring-modification'].map(entry => ({ entry,
    passed: rows.filter(row => row.entry === entry && row.category === 'passed').length,
    completePairs: ['order-kind', 'protection-timing', 'activation', 'validity'].filter(pair => rows.filter(row => row.entry === entry && row.pair === pair && row.category === 'passed').length === 2),
  }));
  writeFileSync(resolve(directory, 'receipt.json'), JSON.stringify({ newModelCalls: 0, requests, responses, httpRequests, providerSettingsEqual: true, groups, rows }, null, 2), { mode: 0o600, flag: 'wx' });
  expect(rows).toHaveLength(24);
  expect([requests, responses, httpRequests]).toEqual([30, 30, 30]);
  console.log(JSON.stringify({ requests, responses, httpRequests, groups }));
});
