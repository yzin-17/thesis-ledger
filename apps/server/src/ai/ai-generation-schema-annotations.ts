const annotations = new Set(['description', 'title', '$comment', 'examples']);
const maps = new Set(['properties', 'patternProperties', 'dependentSchemas', 'definitions', '$defs']);
const children = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems', 'items', 'additionalItems',
  'additionalProperties', 'unevaluatedProperties', 'unevaluatedItems', 'propertyNames', 'contains',
  'not', 'if', 'then', 'else', 'contentSchema']);

/** 只删除Schema位置的说明注解，保留同名业务属性和const／enum数据。 */
export function withoutSchemaAnnotations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSchemaAnnotations);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !annotations.has(key))
    .map(([key, child]) => {
      if (maps.has(key) && child && typeof child === 'object' && !Array.isArray(child))
        return [key, Object.fromEntries(Object.entries(child as Record<string, unknown>).map(([name, schema]) => [name, withoutSchemaAnnotations(schema)]))];
      return [key, children.has(key) ? withoutSchemaAnnotations(child) : child];
    }));
}
