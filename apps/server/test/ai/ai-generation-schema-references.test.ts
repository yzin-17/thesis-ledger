import { expect, it } from 'vitest';
import {
  compactGenerationSchema,
  orderStrategyGenerationFields,
} from '../../src/ai/ai-generation-schema-references.js';

it('内联单次纯引用且只删除被枚举值蕴含的类型，保留矛盾约束及其他断言', () => {
  expect(
    compactGenerationSchema({
      type: 'object',
      properties: {
        value: { $ref: '#/$defs/value' },
        contradiction: { type: 'string', const: 3 },
        choices: { type: 'integer', enum: [1, 2], minimum: 2 },
      },
      required: ['value'],
      additionalProperties: false,
      $defs: { value: { type: 'string', const: 'fixed', minLength: 2 } },
    }),
  ).toEqual({
    type: 'object',
    properties: {
      value: { const: 'fixed', minLength: 2 },
      contradiction: { type: 'string', const: 3 },
      choices: { enum: [1, 2], minimum: 2 },
    },
    required: ['value'],
    additionalProperties: false,
    $defs: {},
  });
});

it('递归共享引用可解析，保留条件与严格对象；常量和示例中的相似文字不被改写', () => {
  const literal = { $ref: '#/$defs/expression', type: 'string', const: 'sample' };
  const output = compactGenerationSchema({
    $defs: {
      expression: {
        anyOf: [
          { const: 'leaf', type: 'string' },
          {
            type: 'object',
            properties: { next: { $ref: '#/$defs/expression' } },
            required: ['next'],
            additionalProperties: false,
          },
        ],
      },
    },
    type: 'object',
    properties: {
      first: { $ref: '#/$defs/expression' },
      second: { $ref: '#/$defs/expression' },
      fixed: { const: literal, examples: [literal] },
    },
    required: ['first', 'second'],
    additionalProperties: false,
  });
  expect(output).toEqual({
    $defs: {
      '0': {
        anyOf: [
          { const: 'leaf' },
          {
            type: 'object',
            properties: { next: { $ref: '#/$defs/0' } },
            required: ['next'],
            additionalProperties: false,
          },
        ],
      },
    },
    type: 'object',
    properties: {
      first: { $ref: '#/$defs/0' },
      second: { $ref: '#/$defs/0' },
      fixed: { const: literal, examples: [literal] },
    },
    required: ['first', 'second'],
    additionalProperties: false,
  });
});

it('带兄弟约束的引用不被内联丢失，原文档保持原值', () => {
  const input = {
    definitions: { value: { type: 'string', minLength: 2 } },
    properties: { value: { $ref: '#/definitions/value', maxLength: 4 } },
  };
  const original = JSON.stringify(input);
  expect(compactGenerationSchema(input)).toEqual({
    definitions: { '0': { type: 'string', minLength: 2 } },
    properties: { value: { $ref: '#/definitions/0', maxLength: 4 } },
  });
  expect(JSON.stringify(input)).toBe(original);
});

it('单项组合只带注解时消去包装，保留联合分支、内部说明和兄弟断言', () => {
  const union = { anyOf: [{ const: 'frozen' }, { const: 'current' }], description: '保护种类' };
  const constrained = { allOf: [union], const: 'frozen', description: '仍须满足常量' };
  const reference = { allOf: [{ $ref: '#/$defs/choice' }], description: '引用说明' };
  const literal = { allOf: [union], description: '这是数据' };
  const output = compactGenerationSchema({
    $defs: {},
    properties: {
      choice: { allOf: [union], description: '按明确要求选择' },
      constrained,
      reference,
      literal: { const: literal },
    },
  });
  expect(output).toEqual({
    $defs: {},
    properties: {
      choice: { ...union, description: '保护种类\n按明确要求选择' },
      constrained,
      reference,
      literal: { const: literal },
    },
  });
});

it('共享短常量直接展开更小，仍保留每个实际约束', () => {
  expect(
    compactGenerationSchema({
      $defs: { version: { const: 1 } },
      properties: {
        first: { $ref: '#/$defs/version' },
        second: { $ref: '#/$defs/version' },
      },
    }),
  ).toEqual({
    $defs: {},
    properties: { first: { const: 1 }, second: { const: 1 } },
  });
});

it('引用展开后再次消除注解组合，无引用注册表时也保留等价清理', () => {
  const choice = { anyOf: [{ const: 'percent' }, { const: 'entryAtr' }], description: '距离类型' };
  const input = {
    $defs: { choice },
    properties: {
      stop: { allOf: [{ $ref: '#/$defs/choice' }], description: '止损' },
    },
  };
  const original = structuredClone(input);
  expect(compactGenerationSchema(input)).toEqual({
    $defs: {},
    properties: { stop: { ...choice, description: '距离类型\n止损' } },
  });
  expect(input).toEqual(original);
  expect(compactGenerationSchema({ allOf: [choice], description: '止损' })).toEqual({
    ...choice,
    description: '距离类型\n止损',
  });
});

it('覆盖先规划、计划置末尾；字段断言、必填集合与原输入不被改写', () => {
  const definition = {
    properties: Object.fromEntries(
      ['entry', 'exit', 'sizing', 'risk', 'tradePlan', 'execution', 'cost'].map((key) => [
        key,
        { const: key },
      ]),
    ),
    required: ['entry', 'exit', 'sizing', 'risk', 'execution', 'cost'],
    additionalProperties: false,
  };
  const input = {
    properties: { definition, coverage: { type: 'array', minItems: 1 } },
    required: ['definition', 'coverage', 'external'],
    additionalProperties: false,
  };
  const original = JSON.stringify(input);
  const output = orderStrategyGenerationFields(input);
  expect(Object.keys(output.properties as object)).toEqual(['coverage', 'definition']);
  expect(output.required).toEqual(['coverage', 'definition', 'external']);
  expect(output.properties).toEqual(input.properties);
  expect(output.additionalProperties).toBe(false);
  const nested = orderStrategyGenerationFields(definition);
  expect(Object.keys(nested.properties as object)).toEqual([
    'entry',
    'exit',
    'sizing',
    'risk',
    'execution',
    'cost',
    'tradePlan',
  ]);
  expect(nested.properties).toEqual(definition.properties);
  expect(nested.required).toEqual(definition.required);
  const requiredPlan = orderStrategyGenerationFields({
    ...definition,
    required: [...definition.required, 'tradePlan'],
  });
  expect(Object.keys(requiredPlan.properties as object)[0]).toBe('tradePlan');
  expect((requiredPlan.required as string[])[0]).toBe('tradePlan');
  expect(requiredPlan.properties).toEqual(definition.properties);
  expect(new Set(requiredPlan.required as string[])).toEqual(
    new Set([...definition.required, 'tradePlan']),
  );
  expect(JSON.stringify(input)).toBe(original);
});
