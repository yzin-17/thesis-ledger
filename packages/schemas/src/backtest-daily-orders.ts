import { z } from 'zod';
import { orderPriceExpressionSchema } from './backtest-expression.js';
import { positiveDecimalStringSchema } from './monetary-values.js';

export const backtestOrderValiditySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('DAY') }),
  z.strictObject({ kind: z.literal('bars'), bars: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('position') }),
]);

export const backtestOrderInstructionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('market') }),
  z.strictObject({ kind: z.literal('limit'), price: orderPriceExpressionSchema }),
  z.strictObject({ kind: z.literal('stopMarket'), price: orderPriceExpressionSchema }),
]);

export const backtestOrderActionSchema = z.union([
  z.strictObject({ kind: z.enum(['entry', 'exit', 'stopLoss', 'takeProfit']) }),
  z.strictObject({ kind: z.literal('stage'), stageId: z.string().trim().min(1) }),
]);

const template = z.strictObject({
  id: z.string().trim().min(1),
  action: backtestOrderActionSchema,
  order: backtestOrderInstructionSchema,
  validity: backtestOrderValiditySchema,
  parent: z
    .strictObject({
      templateId: z.string().trim().min(1),
      activation: z.enum(['eachFill', 'fullFill']),
    })
    .optional(),
  exitGroup: z.string().trim().min(1).optional(),
});

const ordinary = template.omit({ parent: true, exitGroup: true });
const ordinaryValidity = z.discriminatedUnion('kind', [
  backtestOrderValiditySchema.options[0],
  backtestOrderValiditySchema.options[1],
]);
// 保持已有 TypeScript 数据形状；合法组合直接由联合分支表达并传给生成合同。
export const backtestOrderTemplateSchema: z.ZodType<z.infer<typeof template>> = z.union([
  ordinary.extend({
    action: z.strictObject({ kind: z.enum(['entry', 'exit']) }),
    validity: ordinaryValidity,
  }),
  ordinary.extend({
    action: z.strictObject({ kind: z.literal('stage'), stageId: z.string().trim().min(1) }),
    validity: ordinaryValidity,
  }),
  template.extend({
    action: z.strictObject({ kind: z.literal('stopLoss') }),
    order: backtestOrderInstructionSchema.options[2],
    parent: template.shape.parent.unwrap(),
  }),
  template.extend({
    action: z.strictObject({ kind: z.literal('takeProfit') }),
    order: backtestOrderInstructionSchema.options[1],
    parent: template.shape.parent.unwrap(),
  }),
]);

export const backtestRequiredOrderActions = ['entry', 'exit'] as const;
export const backtestOrderTemplatesSchema = z.array(backtestOrderTemplateSchema).min(1);

export const backtestDailyOrderExecutionSchema = z
  .strictObject({
    mode: z.literal('exchange'),
    timing: z.literal('dailyBarOrders'),
    orders: backtestOrderTemplatesSchema,
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const actions = new Set<string>();
    const groups = new Map<string, typeof value.orders>();
    const issue = (index: number, field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: ['orders', index, field], message });
    value.orders.forEach((template, index) => {
      if (ids.has(template.id)) issue(index, 'id', '委托模板 id 不得重复');
      ids.add(template.id);
      const action =
        template.action.kind === 'stage'
          ? `stage:${template.action.stageId}`
          : template.action.kind;
      if (actions.has(action) && !['stopLoss', 'takeProfit'].includes(action))
        issue(index, 'action', '同一动作只能有一个委托模板');
      actions.add(action);
      if (template.parent) {
        const parent = value.orders.find((order) => order.id === template.parent!.templateId);
        if (!parent || !['entry', 'stage'].includes(parent.action.kind))
          issue(index, 'parent', '保护父单必须引用本配置的建仓或加仓模板');
      }
      if (
        template.order.kind !== 'market' &&
        template.order.price.type === 'constant' &&
        !positiveDecimalStringSchema.safeParse(template.order.price.value).success
      )
        issue(index, 'order', '委托价格常量必须大于零');
      if (template.exitGroup) {
        const group = groups.get(template.exitGroup) ?? [];
        group.push(template);
        groups.set(template.exitGroup, group);
      }
    });
    if (backtestRequiredOrderActions.some((action) => !actions.has(action)))
      ctx.addIssue({
        code: 'custom',
        path: ['orders'],
        message: '日线委托须明确建仓和普通退出模板',
      });
    for (const [id, group] of groups) {
      if (
        group.length !== 2 ||
        new Set(group.map((t) => t.action.kind)).size !== 2 ||
        group.some((t) => !['stopLoss', 'takeProfit'].includes(t.action.kind)) ||
        group.some(
          (t) =>
            t.parent?.templateId !== group[0]!.parent?.templateId ||
            t.parent?.activation !== group[0]!.parent?.activation,
        )
      )
        ctx.addIssue({
          code: 'custom',
          path: ['orders'],
          message: `退出组 ${id} 必须为同父单、同激活方式的一条止损和一条止盈`,
        });
    }
  });

export const backtestDailyMatchingSchema = z.strictObject({
  conflict: z.literal('stopFirst'),
  childActivation: z.literal('openSameBarRangeNextBar'),
  partialExit: z.literal('protectRemaining'),
  liquidity: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('wholeOrder') }),
    z.strictObject({ kind: z.literal('unlimited') }),
    z.strictObject({ kind: z.literal('perBarCap'), quantity: positiveDecimalStringSchema }),
  ]),
});

export type BacktestDailyOrderExecution = z.infer<typeof backtestDailyOrderExecutionSchema>;
export type BacktestDailyMatching = z.infer<typeof backtestDailyMatchingSchema>;
