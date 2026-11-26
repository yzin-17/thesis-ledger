import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiGenerationContracts, strategySchema } from '@thesis-ledger/schemas';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';

// 私有原始捕获只读；本文件没有模型、数据库或网络调用。
const root = process.env.BACKTEST_DAILY_ORDER_CAPTURE_ROOT;
const entries = ['discovery', 'authoring', 'modification'] as const;
const cases = [['limit', 'market', 'touch', 'close'], ['each-fill', 'full-fill', 'day', 'two-bars']];
const samples = entries.flatMap(entry => cases.flatMap((ids, index) => ids.map((id, i) => ({
  entry, batch: index === 0 ? 'a' : 'b', id, call: i + 2,
}))));
const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
type Validator = ((value: unknown) => boolean) & { errors?: { dataPath?: string; keyword: string }[] };

describe.skipIf(!root)('原始 T04d 捕获的离线生成合同核对', () => {
  const require = createRequire(import.meta.url);
  // 复用已安装的 ESLint 校验依赖，不引入新的业务依赖。
  const Ajv = require(require.resolve('ajv', { paths: [require.resolve('eslint')] })) as new (options: object) => { compile: (schema: unknown) => Validator };
  it.each(samples)('$entry-$batch $id', async ({ entry, batch, id, call }) => {
    const dir = join(root!, `backtest-daily-orders-contract-${entry}-${batch}-20261117`);
    const raw = await read<{ finalJsonAvailable?: boolean }>(join(dir, `wire-output-${call}-1.json`));
    if (raw.finalJsonAvailable === false) {
      expect(`${entry}-${id}`).toBe('authoring-limit');
      return; // 原输出截断，没有最终 JSON；不能补成配置参与校验。
    }
    const input = await read<{ operation: Parameters<typeof authoringOperationSchema>[0] }>(join(dir, `${id}-input.json`));
    const receipt = await read<{ category: string; configuration?: unknown }>(join(dir, `${id}.json`));
    const wire = await read<{ responseFormat: { json_schema: { schema: unknown } } }>(join(dir, `wire-${call}-1.json`));
    const contract = {
      discovery: aiGenerationContracts.strategyDiscovery,
      authoring: aiGenerationContracts.authoringGeneration,
      modification: aiGenerationContracts.authoringModification,
    }[entry];
    const schema = entry === 'discovery' ? contract.schema : authoringOperationSchema(input.operation);
    const native = await generationOutput('native_schema', schema, contract.ref).responseFormat;
    if (native?.type !== 'json') throw new Error('缺少原生合同');
    const ajv = new Ajv({ allErrors: true, strictKeywords: true });
    const before = ajv.compile(wire.responseFormat.json_schema.schema)(raw);
    const afterValidator = ajv.compile(native.schema);
    const after = afterValidator(raw);
    const final = schema.safeParse(raw);
    const knownRemaining = entry === 'authoring' && (id === 'touch' || id === 'each-fill' || id === 'full-fill');
    const canonicalSuccess = receipt.category === 'passed' && !(entry === 'authoring' && id === 'two-bars');
    expect(after).toBe(canonicalSuccess || knownRemaining);
    expect(final.success).toBe(receipt.category === 'passed' || (entry === 'discovery' && id === 'two-bars'));
    if (receipt.category === 'passed') {
      expect(final.success).toBe(true);
      expect(strategySchema.parse(receipt.configuration)).toEqual(receipt.configuration);
      if (final.success) expect((final.data as { definition: unknown }).definition).toEqual(receipt.configuration);
    }
    if (knownRemaining) expect(before && after && !final.success).toBe(true);
    if (entry === 'authoring' && id === 'close') expect(before && !after && !final.success).toBe(true);
    console.info(JSON.stringify({ entry, batch, id, before, after, final: final.success, category: receipt.category,
      nativeErrors: afterValidator.errors?.map(error => ({ path: error.dataPath, keyword: error.keyword })),
      finalErrors: final.success ? [] : final.error.issues.map(issue => ({ path: issue.path, message: issue.message })),
    }));
  });
});
