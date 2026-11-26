import { z } from 'zod';
import { backtestOrderTemplatesSchema, backtestRequiredOrderActions } from '@thesis-ledger/schemas';
import { generationOrderSlots } from './ai-generation-order-slots.js';

// 只投影已知十进制合同。捕获组和 ASCII 数字类可直接转换为原生 grammar。
const nativeDecimalPatterns = new Set([
  /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.source,
  /^(?:0|[1-9]\d*)(?:\.\d+)?$/.source,
  /^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/.source,
  /^(?:1(?:\.0+)?|0\.\d*[1-9]\d*)$/.source,
  /^[1-9]\d*$/.source,
  /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.source,
]);

/** 只删除没有其他断言的单引用组合层，递归定义和全部约束保持原值。 */
export function directSchemaReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(directSchemaReferences);
  if (value === null || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length === 1 && Array.isArray(row.allOf) && row.allOf.length === 1) {
    const item = row.allOf[0] as unknown;
    if (
      item !== null &&
      typeof item === 'object' &&
      Object.keys(item).length === 1 &&
      '$ref' in item &&
      typeof item.$ref === 'string'
    )
      return { $ref: item.$ref };
  }
  return Object.fromEntries(
    Object.entries(row).map(([key, child]) => [key, directSchemaReferences(child)]),
  );
}

/** 文本与原生格式共同保留元组长度和逐项约束。 */
export function generationJsonSchema(
  schema: z.ZodType,
  target: 'draft-7' | 'draft-2020-12',
  reused: 'inline' | 'ref' = 'inline',
  io: 'input' | 'output' = 'output',
) {
  return generationOrderSlots(
    z.toJSONSchema(schema, {
      target,
      reused,
      io,
      override: ({ zodSchema, jsonSchema }) => {
        const pattern = jsonSchema.pattern;
        if (target === 'draft-7' && pattern && nativeDecimalPatterns.has(pattern)) {
          jsonSchema.pattern = pattern.replaceAll('(?:', '(').replaceAll('\\d', '[0-9]');
        }
        if (zodSchema === backtestOrderTemplatesSchema) {
          // 仅作中间定位；返回前展开为槽位，实际生成参数不携带 contains。
          jsonSchema.allOf = backtestRequiredOrderActions.map((kind) => ({
            contains: {
              type: 'object',
              properties: {
                action: {
                  type: 'object',
                  properties: { kind: { const: kind } },
                  required: ['kind'],
                },
              },
              required: ['action'],
            },
          }));
        }
        if (zodSchema instanceof z.ZodTuple) {
          const definition = zodSchema._zod.def;
          let requiredLength = 0;
          for (let index = definition.items.length - 1; index >= 0; index--) {
            const item = definition.items[index];
            if (item && item._zod.optin !== 'optional') {
              requiredLength = index + 1;
              break;
            }
          }
          jsonSchema.minItems = Math.max(jsonSchema.minItems ?? 0, requiredLength);
          if (!definition.rest) {
            jsonSchema.maxItems = Math.min(
              jsonSchema.maxItems ?? definition.items.length,
              definition.items.length,
            );
            if (target === 'draft-7') jsonSchema.additionalItems = false;
            else jsonSchema.items = false;
          }
        }
        if (jsonSchema.type === 'object' && jsonSchema.additionalProperties === undefined) {
          jsonSchema.additionalProperties = false;
        }
      },
    }),
  );
}
