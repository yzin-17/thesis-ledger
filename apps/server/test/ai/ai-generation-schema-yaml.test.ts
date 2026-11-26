import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { compactGenerationYaml } from '../../src/ai/ai-generation-schema-yaml.js';

it('标准 YAML 锚点保留特殊字符与换行标量，默认解析限制可通过', () => {
  const shared = {
    type: 'string',
    pattern: '^(?:[a-z]+)\\n$',
    description: '第一行\n第二行',
    enum: ['yes', 'true', '1', '*anchor', '#note'],
  };
  const document = {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => ['field' + index, shared]),
    ),
  };
  const serialized = compactGenerationYaml(document);
  expect(serialized.split('\n')).toHaveLength(1);
  expect(parse(serialized)).toStrictEqual(document);
});

it('重复长键仍为完整字段名，必填列表与闭合断言不变', () => {
  const document = Array.from({ length: 60 }, (_, index) => ({
    type: 'object',
    properties: { ['value' + index]: { type: 'integer', minimum: index } },
    additionalProperties: false,
    required: ['value' + index],
  }));
  expect(parse(compactGenerationYaml(document))).toStrictEqual(document);
});

it('压缩flow分隔符不改变引号、撇号、正则或字符串里的逗号空格', () => {
  const value = {
    values: ["can't", 'a, b', 'quote "a, b"', "it's 'a, b'", '\\n, \\t', '{a, b}', '^[a-z]{1, 3}$'],
    empty: {},
    nested: [1, 2, 3],
  };
  const text = compactGenerationYaml(value);
  expect(text).toContain('a, b');
  expect(parse(text)).toStrictEqual(value);
  expect(text).not.toContain(', nested:');
});
