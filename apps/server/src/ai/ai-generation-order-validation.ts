import { z } from 'zod';

type Schema = z.core.JSONSchema.BaseSchema;

export function generationOrderRoleIssue(index: number, kind?: string) {
  const allowed =
    index < 2 ? [index === 0 ? 'entry' : 'exit'] : ['stage', 'stopLoss', 'takeProfit'];
  if (!allowed.includes(kind ?? ''))
    return `生成委托第 ${index + 1} 项只允许 ${allowed.join('／')}`;
}

/** 只校验生成投影标出的可编辑槽位；冻结历史元组不带此标记。 */
export function generationOrderSlotError(document: Schema, value: unknown): z.ZodError | null {
  const issues: z.core.$ZodIssue[] = [];
  const visit = (schema: Schema, input: unknown, path: (string | number)[]): void => {
    if (schema.$ref) {
      const target = schema.$ref
        .slice(2)
        .split('/')
        .reduce((node, key) => node[key] as Schema, document);
      visit(target, input, path);
      return;
    }
    const slots = schema.allOf?.[0]?.items;
    if (
      schema.type === 'array' &&
      !Array.isArray(schema.items) &&
      schema.items &&
      typeof schema.items === 'object' &&
      schema.items.anyOf &&
      Array.isArray(slots) &&
      Array.isArray(input)
    ) {
      input.forEach((order: { action?: { kind?: string } }, index) => {
        const message = generationOrderRoleIssue(index, order.action?.kind);
        if (message)
          issues.push({
            code: 'custom',
            path: [...path, index, 'action', 'kind'],
            message,
          });
      });
      return;
    }
    for (const branch of [
      ...(schema.anyOf ?? []),
      ...(schema.oneOf ?? []),
      ...(schema.allOf ?? []),
    ])
      visit(branch, input, path);
    // 只沿正式策略输出包装定位委托，不遍历条件和价格表达式 AST。
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      for (const key of ['proposal', 'definition', 'strategy', 'execution', 'orders']) {
        const child = schema.properties?.[key];
        if (child && key in input)
          visit(child as Schema, (input as Record<string, unknown>)[key], [...path, key]);
      }
    }
  };
  visit(document, value, []);
  return issues.length ? new z.ZodError(issues) : null;
}
