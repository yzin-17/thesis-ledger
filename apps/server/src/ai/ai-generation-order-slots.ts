import type { z } from 'zod';
import { backtestRequiredOrderActions } from '@thesis-ledger/schemas';

type Schema = z.core.JSONSchema.BaseSchema;

/** 把生成器标出的必需动作展开为固定槽位，保留同一文档中的表达式引用。 */
export function generationOrderSlots(document: Schema): Schema {
  const resolve = (schema: Schema): Schema => {
    while (schema.$ref) {
      schema = schema.$ref
        .slice(2)
        .split('/')
        .reduce((node, key) => node[key] as Schema, document);
    }
    return schema;
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const schema = value as Schema;
    const requiredActions = schema.allOf?.map((check) => {
      const action = (check.contains as Schema | undefined)?.properties?.action as
        Schema | undefined;
      return (action?.properties?.kind as Schema | undefined)?.const;
    });
    if (
      schema.type === 'array' &&
      JSON.stringify(requiredActions) === JSON.stringify(backtestRequiredOrderActions)
    ) {
      const branches = resolve(schema.items as Schema).anyOf!;
      const ordinary = resolve(branches[0]!);
      const slots = backtestRequiredOrderActions.map((kind) => ({
        ...ordinary,
        properties: {
          ...ordinary.properties,
          action: {
            ...resolve(ordinary.properties!.action as Schema),
            properties: { kind: { type: 'string' as const, const: kind } },
          },
        },
      }));
      const remaining = { anyOf: branches.slice(1) };
      schema.minItems = slots.length;
      delete schema.allOf;
      if (document.$schema?.includes('2020-12')) {
        schema.prefixItems = slots;
        schema.items = remaining;
      } else {
        // 部分原生解码器会把外层元组直接截为两项；外层先开放全部角色。
        const definitions = (document.definitions ??= {}) as Record<string, Schema>;
        const references = [...slots, ...remaining.anyOf].map((slot, index) => {
          if (slot.$ref) return slot;
          let key = `orderSlot${index}`;
          while (key in definitions) key += '_';
          definitions[key] = slot;
          return { $ref: `#/definitions/${key}` };
        });
        const required = references.slice(0, slots.length);
        const extra = { anyOf: references.slice(slots.length) };
        schema.items = { anyOf: references };
        schema.allOf = [
          {
            items: required,
            additionalItems: extra,
          },
          {
            // 只有一张附属委托时，退出组不可能配对。
            if: { maxItems: slots.length + 1 },
            then: { items: { not: { required: ['exitGroup'] } } },
          },
        ];
      }
    }
    Object.values(schema).forEach(visit);
  };
  visit(document);
  return document;
}
