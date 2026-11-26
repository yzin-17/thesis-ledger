import { expect, it } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { nativeStrategySchema } from '../../src/ai/ai-native-strategy-schema.js';
import { directSchemaReferences, generationJsonSchema } from '../../src/ai/ai-generation-json-schema.js';
import { parseGenerationOutput } from '../../src/ai/ai-generation-output.js';

it('只等价删除无其他断言的单引用包装，其他组合与字段保持完整', () => {
  const input = {
    definitions: { a: { type: 'string', minLength: 2 } },
    properties: {
      a: { allOf: [{ $ref: '#/definitions/a' }] },
      b: { allOf: [{ $ref: '#/definitions/a' }], minLength: 4 },
      c: { allOf: [{ $ref: '#/definitions/a' }, { maxLength: 8 }] },
    },
  };
  expect(directSchemaReferences(input)).toEqual({
    ...input,
    properties: {
      ...input.properties,
      a: { $ref: '#/definitions/a' },
    },
  });
});

it('原生声明传输输入，只做一次固定解包；文本模式使用同一输入合同', async () => {
  const schema = z
    .strictObject({ proposal: z.strictObject({ value: z.literal('完整原值') }) })
    .transform(({ proposal }) => proposal);
  const projected = nativeStrategySchema(schema, aiGenerationContracts.authoringGeneration.ref);
  if (!('jsonSchema' in projected) || !('validate' in projected)) throw new Error('缺少原生投影');
  expect(await projected.jsonSchema).toMatchObject({
    properties: { proposal: { type: 'object' } },
  });
  const raw = { proposal: { value: '完整原值' } };
  const parsed = await projected.validate?.(raw);
  expect(parsed).toMatchObject({ success: true, value: raw.proposal });
  if (!parsed?.success) throw new Error('未通过输入校验');
  expect(parseGenerationOutput('native_schema', schema, parsed.value)).toEqual(raw.proposal);
  expect(parseGenerationOutput('json_mode', schema, raw)).toEqual(raw.proposal);
  expect(parseGenerationOutput('json_validated', schema, JSON.stringify(raw))).toEqual(
    raw.proposal,
  );
  expect(await projected.validate?.(raw.proposal)).toMatchObject({ success: false });
});

it('其他用途保留Zod对象；策略投影仍执行原始最终校验', async () => {
  const other = z.object({ value: z.string() });
  expect(nativeStrategySchema(other)).toBe(other);
  expect(nativeStrategySchema(other, aiGenerationContracts.authoringAnalysis.ref)).toBe(other);
  expect(nativeStrategySchema(other, aiGenerationContracts.authoringGeneration.ref)).not.toBe(
    other,
  );
  for (const contract of [
    aiGenerationContracts.strategyDiscovery,
    aiGenerationContracts.authoringGeneration,
    aiGenerationContracts.authoringModification,
  ]) {
    const projected = nativeStrategySchema(contract.schema as z.ZodType);
    expect(projected).not.toBe(contract.schema);
    if ('validate' in projected)
      expect(await projected.validate?.({})).toMatchObject({ success: false });
    if ('jsonSchema' in projected)
      expect(JSON.stringify(await projected.jsonSchema)).toContain('activation');
  }
});

it('原生格式保留冻结数组逐项值、必需长度和额外项禁令', async () => {
  const schema = z.object({ frozen: z.tuple([z.literal('AAPL'), z.literal('1d')]) });
  const projected = nativeStrategySchema(schema, aiGenerationContracts.authoringModification.ref);
  if (!('jsonSchema' in projected)) throw new Error('未使用原生投影');
  const document = await projected.jsonSchema;
  expect(document).toMatchObject({
    properties: {
      frozen: {
        minItems: 2,
        maxItems: 2,
        additionalItems: false,
        items: [{ const: 'AAPL' }, { const: '1d' }],
      },
    },
  });
  if (!('validate' in projected)) throw new Error('缺少最终校验');
  expect(await projected.validate?.({ frozen: ['AAPL'] })).toMatchObject({ success: false });
  expect(await projected.validate?.({ frozen: ['AAPL', '1d', 'extra'] })).toMatchObject({
    success: false,
  });
  expect(await projected.validate?.({ frozen: ['AAPL', '1d'] })).toMatchObject({ success: true });
});

it('原生十进制 grammar 保留数值范围并排除真实捕获中的空常量', () => {
  const original = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const schema = z.string().regex(original);
  const native = generationJsonSchema(schema, 'draft-7').pattern!;
  expect(native).toBe('^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$');
  expect(generationJsonSchema(schema, 'draft-2020-12').pattern).toBe(original.source);
  for (const value of ['', '},', '01', '0', '-2', '0.10', '9', '9.', '９']) {
    expect(new RegExp(native).test(value)).toBe(schema.safeParse(value).success);
  }
  const other = /^([0-9])\1$/;
  expect(generationJsonSchema(z.string().regex(other), 'draft-7').pattern).toBe(other.source);
});
