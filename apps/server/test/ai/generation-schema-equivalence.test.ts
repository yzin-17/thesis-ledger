import { expect, it } from 'vitest';
import { withoutSchemaAnnotations } from '../../src/ai/ai-generation-schema-annotations.js';
import { equivalentGenerationSchemas } from './generation-schema-equivalence.fixture.js';

it('同名业务属性及常量数据不是Schema注解，顺序等价检查不能吞掉约束变化', () => {
  const schema = { type: 'object', description: 'Schema说明', additionalProperties: false,
    properties: { description: { type: 'string', description: '字段说明', maxLength: 20 },
      value: { const: { description: '必须保留', title: '值标题' } } }, required: ['value'] };
  expect(withoutSchemaAnnotations(schema)).toEqual({ type: 'object', additionalProperties: false,
    properties: { description: { type: 'string', maxLength: 20 }, value: { const: { description: '必须保留', title: '值标题' } } }, required: ['value'] });
  const reordered = { ...schema, description: '其他注解' };
  expect(equivalentGenerationSchemas(schema, reordered)).toBe(true);
  const missing = structuredClone(schema); delete (missing.properties as { description?: unknown }).description;
  expect(equivalentGenerationSchemas(schema, missing)).toBe(false);
  expect(equivalentGenerationSchemas(schema, { ...schema, additionalProperties: true })).toBe(false);
  expect(equivalentGenerationSchemas(schema, { ...schema, properties: { ...schema.properties,
    value: { const: { description: '不同数据', title: '值标题' } } } })).toBe(false);
});

it('递归引用改名及联合置换等价，改变联合叶子的取值范围不等价', () => {
  const a = { $ref: '#/definitions/node', definitions: { node: { anyOf: [
    { type: 'number', minimum: 1 }, { type: 'object', properties: { next: { $ref: '#/definitions/node' } } },
  ] } } };
  const b = { $ref: '#/$defs/value', $defs: { value: { anyOf: [
    { type: 'object', properties: { next: { $ref: '#/$defs/value' } } }, { type: 'number', minimum: 1 },
  ] } } };
  expect(equivalentGenerationSchemas(a, b)).toBe(true);
  const changed = structuredClone(b); Object.assign(changed.$defs.value.anyOf[1]!, { minimum: 0 });
  expect(equivalentGenerationSchemas(a, changed)).toBe(false);
});
