type SchemaObject = Record<string, unknown>;

/** 覆盖先于定义；必填计划先生成，可选计划保持末尾，不改变字段断言。 */
export function orderStrategyGenerationFields(row: SchemaObject): SchemaObject {
  if (!row.properties || typeof row.properties !== 'object' || Array.isArray(row.properties))
    return row;
  const properties = row.properties as SchemaObject;
  const keys = Object.keys(properties);
  const authoring =
    Object.hasOwn(properties, 'definition') && Object.hasOwn(properties, 'coverage');
  const strategy = ['entry', 'exit', 'sizing', 'risk', 'execution', 'cost', 'tradePlan'].every(
    (key) => Object.hasOwn(properties, key),
  );
  if (!authoring && !strategy) return row;
  const required = Array.isArray(row.required) ? (row.required as unknown[]) : null;
  let order: string[];
  if (authoring) order = ['coverage', ...keys.filter((key) => key !== 'coverage')];
  else if (required?.includes('tradePlan'))
    order = ['tradePlan', ...keys.filter((key) => key !== 'tradePlan')];
  else order = [...keys.filter((key) => key !== 'tradePlan'), 'tradePlan'];
  return {
    ...row,
    properties: Object.fromEntries(order.map((key) => [key, properties[key]])),
    ...(required
      ? {
          required: [
            ...order.filter((key) => required.includes(key)),
            ...required.filter((key: unknown) => !order.includes(key as string)),
          ],
        }
      : {}),
  };
}

function mapSchema(value: unknown, replace: (row: SchemaObject) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => mapSchema(item, replace));
  if (!value || typeof value !== 'object') return value;
  return replace(
    Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        ['const', 'enum', 'default', 'examples'].includes(key) ? child : mapSchema(child, replace),
      ]),
    ),
  );
}

function impliedType(row: SchemaObject): SchemaObject {
  const values = Object.hasOwn(row, 'const') ? [row.const] : row.enum;
  if (typeof row.type !== 'string' || !Array.isArray(values) || !values.length) return row;
  const matches = values.every((value) => {
    if (row.type === 'null') return value === null;
    if (row.type === 'array') return Array.isArray(value);
    if (row.type === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
    if (row.type === 'integer') return Number.isInteger(value);
    return typeof value === row.type;
  });
  if (!matches) return row;
  const rest = { ...row };
  delete rest.type;
  return rest;
}

function annotatedComposition(row: SchemaObject): SchemaObject {
  if (
    !Array.isArray(row.allOf) ||
    row.allOf.length !== 1 ||
    Object.keys(row).some((key) => !['allOf', 'title', 'description', '$comment'].includes(key))
  )
    return row;
  const child: unknown = row.allOf[0];
  if (!child || typeof child !== 'object' || Array.isArray(child) || '$ref' in child) return row;
  const content = child as SchemaObject;
  const annotations = { ...row };
  delete annotations.allOf;
  return {
    ...content,
    ...annotations,
    ...(typeof content.description === 'string' && typeof row.description === 'string'
      ? { description: content.description + '\n' + row.description }
      : {}),
  };
}

/** 仅压缩生成文档的本地引用与注解包装，保留全部断言。 */
export function compactGenerationSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  let document = mapSchema(value, (row) =>
    orderStrategyGenerationFields(impliedType(annotatedComposition(row))),
  ) as SchemaObject;
  const registry = document.$defs ? '$defs' : 'definitions';
  if (!document[registry] || typeof document[registry] !== 'object') return document;
  const prefix = `#/${registry}/`;
  let definitions = { ...(document[registry] as SchemaObject) };
  while (true) {
    const counts = new Map<string, number>(),
      pure = new Map<string, number>();
    mapSchema(document, (row) => {
      if (typeof row.$ref === 'string') {
        counts.set(row.$ref, (counts.get(row.$ref) ?? 0) + 1);
        if (Object.keys(row).length === 1) pure.set(row.$ref, (pure.get(row.$ref) ?? 0) + 1);
      }
      return row;
    });
    const entry = Object.entries(definitions).find(([key, definition]) => {
      const ref = prefix + key;
      const count = counts.get(ref) ?? 0;
      const bytes = (node: unknown) => Buffer.byteLength(JSON.stringify(node));
      return (
        count > 0 &&
        pure.get(ref) === count &&
        (count === 1 ||
          bytes(definition) * count <
            bytes({ $ref: ref }) * count + bytes(definition) + key.length + 4) &&
        !JSON.stringify(definition).includes(JSON.stringify(ref))
      );
    });
    if (!entry) break;
    const [key, definition] = entry;
    document = mapSchema(document, (row) =>
      Object.keys(row).length === 1 && row.$ref === prefix + key ? definition : row,
    ) as SchemaObject;
    definitions = { ...(document[registry] as SchemaObject) };
    delete definitions[key];
    document = { ...document, [registry]: definitions };
  }
  // 展开引用可能刚刚产生带注解的单项组合，必须再清理一次。
  document = mapSchema(document, (row) =>
    orderStrategyGenerationFields(impliedType(annotatedComposition(row))),
  ) as SchemaObject;
  definitions = { ...(document[registry] as SchemaObject) };
  const names = new Map(
    Object.keys(definitions).map((key, index) => [prefix + key, prefix + index.toString(36)]),
  );
  const rename = (node: unknown) =>
    mapSchema(node, (row) =>
      typeof row.$ref === 'string' && names.has(row.$ref)
        ? { ...row, $ref: names.get(row.$ref) }
        : row,
    );
  return {
    ...(rename(document) as SchemaObject),
    [registry]: Object.fromEntries(
      Object.entries(definitions).map(([key, definition]) => [
        names.get(prefix + key)!.slice(prefix.length),
        rename(definition),
      ]),
    ),
  };
}
