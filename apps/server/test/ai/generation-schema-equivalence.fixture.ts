type Document = Record<string, unknown>;
const annotations = new Set(['description', 'title', '$comment', 'examples', '$schema', 'definitions', '$defs']);

/** 比较实际JSON Schema图；联合顺序及引用名称不改变合法对象集合。 */
export function equivalentGenerationSchemas(left: Document, right: Document): boolean {
  const ids = new WeakMap<object, number>(); let nextId = 0;
  const id = (value: object) => { if (!ids.has(value)) ids.set(value, ++nextId); return ids.get(value)!; };
  const resolve = (node: unknown, document: Document): unknown => {
    const visited = new Set<unknown>();
    while (node && typeof node === 'object' && !Array.isArray(node)) {
      if (visited.has(node)) return node;
      visited.add(node);
      const row = node as Document;
      if (typeof row.$ref === 'string' && row.$ref.startsWith('#/')) {
        node = row.$ref.slice(2).split('/').reduce<unknown>((current, key) =>
          current && typeof current === 'object' ? (current as Document)[key.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined, document);
      } else if (Array.isArray(row.allOf) && row.allOf.length === 1 &&
        Object.keys(row).every((key) => key === 'allOf' || annotations.has(key))) node = row.allOf[0];
      else return node;
    }
    return node;
  };
  const tag = (node: unknown, document: Document) => {
    const value = resolve(node, document) as { properties?: { type?: { const?: unknown } } } | null;
    return value?.properties?.type?.const;
  };
  type Context = 'schema' | 'map' | 'data';
  const maps = new Set(['properties', 'patternProperties', 'dependentSchemas']);
  const children = new Set(['anyOf', 'oneOf', 'allOf', 'items', 'prefixItems', 'additionalItems',
    'not', 'if', 'then', 'else', 'additionalProperties', 'propertyNames', 'contains', 'unevaluatedProperties', 'unevaluatedItems']);
  const same = (a: unknown, b: unknown, seen: ReadonlySet<string>, unordered = false, context: Context = 'schema'): boolean => {
    if (context === 'schema') { a = resolve(a, left); b = resolve(b, right); }
    if (Object.is(a, b)) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const pair = `${context}:${id(a)}:${id(b)}`;
    if (seen.has(pair)) return true;
    const visited = new Set(seen); visited.add(pair);
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      if (!unordered) return a.every((child, index) => same(child, b[index], visited, false, context));
      const used = new Set<number>();
      return a.every((child) => {
        const selected = b.findIndex((candidate, index) => !used.has(index) &&
          tag(child, left) === tag(candidate, right) && same(child, candidate, visited));
        if (selected < 0) return false;
        used.add(selected); return true;
      });
    }
    const ak = Object.keys(a).filter((key) => context !== 'schema' || !annotations.has(key)).sort();
    const bk = Object.keys(b).filter((key) => context !== 'schema' || !annotations.has(key)).sort();
    return JSON.stringify(ak) === JSON.stringify(bk) && ak.every((key) => {
      let next: Context = 'data';
      if (context === 'map' || (context === 'schema' && children.has(key))) next = 'schema';
      else if (context === 'schema' && maps.has(key)) next = 'map';
      return same((a as Document)[key], (b as Document)[key], visited,
        context === 'schema' && ['anyOf', 'oneOf', 'allOf'].includes(key), next);
    });
  };
  return same(left, right, new Set());
}
