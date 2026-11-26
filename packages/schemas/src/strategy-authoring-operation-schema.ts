import { z } from 'zod';
import {
  authoringGenerationOutputSchema,
  authoringModificationOutputSchema,
} from './strategy-authoring-generation.js';
import type { AuthoringConfirmation } from './strategy-authoring-confirmation.js';
import type { AuthoringModificationTarget } from './strategy-authoring-modification.js';
import { generatedTradePlanSchema } from './backtest-trade-plan-generation.js';
import { seriesFieldSchema } from './backtest-values.js';
import { backtestDailyOrderExecutionSchema } from './backtest-daily-orders.js';

/** 将已确认的 JSON 事实变为精确合同，不从说明文字推断交易含义。 */
export function frozenAuthoringField(value: unknown): z.ZodType {
  if (value === null) return z.null();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return z.literal(value);
  if (Array.isArray(value)) {
    if (!value.length) return z.array(z.unknown()).length(0);
    return z.tuple([frozenAuthoringField(value[0]), ...value.slice(1).map(frozenAuthoringField)]);
  }
  if (value && typeof value === 'object')
    return z.strictObject(
      Object.fromEntries(
        Object.entries(value)
          .filter(([, child]) => child !== undefined)
          .map(([key, child]) => [key, frozenAuthoringField(child)]),
      ),
    );
  throw new Error('AUTHORING_SCHEMA_FREEZE_NOT_JSON');
}
const frozenField = frozenAuthoringField;

export function authoringRequirementCoverageSchema(ids: string[], roots: string[]) {
  const paths = z
    .array(z.enum(roots as [string, ...string[]]))
    .min(1)
    .max(64);
  const item = (id: string) =>
    z.strictObject({ requirementId: z.literal(id), definitionPaths: paths });
  const [first, ...remaining] = ids;
  return first === undefined ? z.tuple([]) : z.tuple([item(first), ...remaining.map(item)]);
}

function checkedDefinition(fields: Record<string, z.ZodType>, base: z.ZodType) {
  return z.strictObject(fields).superRefine((value, ctx) => {
    const result = base.safeParse(value);
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
  });
}

function linkedProposal(fields: Record<string, z.ZodType>, ids: string[], base: z.ZodType) {
  const variant = (shape: Record<string, z.ZodType>) =>
    z.strictObject({
      coverage: authoringRequirementCoverageSchema(
        ids,
        Object.keys(shape).filter((key) => key !== 'description'),
      ),
      definition: checkedDefinition(shape, base),
    });
  const { tradePlan, ...remaining } = fields;
  const proposal =
    tradePlan instanceof z.ZodOptional
      ? z.union([
          variant({ tradePlan: tradePlan.unwrap() as z.ZodType, ...remaining }),
          variant(remaining),
        ])
      : variant(fields);
  // 验收 wire 留存核对文本；业务输出只解包配置，不解析文本补规则。
  return z
    .strictObject({
      intentCheck: z
        .string()
        .min(1)
        .max(2_000)
        .describe(
          '生成 proposal 前，简短逐项复述本次要求的具体交易动作、距离类型及数值、启用条件及数值、等待和仓位；修改以当前 intent 为准，明确相对 previousTradePlan 的变化。只复述需求，不引入假设、示例参数或新规则。随后生成的配置必须与该核对一致。此文本不参与执行。',
        ),
      proposal,
    })
    .transform((value) => value.proposal);
}

export function authoringOperationGenerationSchema(input: {
  confirmation?: AuthoringConfirmation | null | undefined;
  baseline?: Record<string, unknown> | undefined;
  target?: Exclude<AuthoringModificationTarget, 'entryOrderValidity'> | undefined;
  requirementIds?: string[] | undefined;
}) {
  const base = input.baseline
    ? authoringModificationOutputSchema.shape.definition
    : authoringGenerationOutputSchema.shape.definition;
  let fields: Record<string, z.ZodType> = { ...base.shape };
  if (input.baseline && input.target) {
    fields = Object.fromEntries(
      Object.entries(input.baseline)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, frozenField(value)]),
    );
    fields[input.target] = base.shape[input.target];
    if (input.target === 'tradePlan') fields.tradePlan = generatedTradePlanSchema.optional();
  } else if (input.confirmation) {
    const c = input.confirmation;
    for (const [key, value] of Object.entries({
      executionInstrument: c.instrument,
      primaryTimeframe: c.timeframe,
      sizing: c.sizing,
      risk: c.risk,
      execution: c.execution,
      cost: c.cost,
    }))
      fields[key] = frozenField(value);
    if (c.execution.timing === 'dailyBarOrders' && !('orders' in c.execution)) fields.execution = backtestDailyOrderExecutionSchema.describe('确认只选定日线委托方式，需按原始需求生成完整订单模板。mode、timing保持确认值；不能只复制方式而省略orders。');
    fields.exit = base.shape.exit.describe(
      '这里只表达用户独立要求的普通退出。首笔成交价比例保护、ATR保护及追踪保护写在tradePlan，不重复映射为价格与常量比较。用户没有独立普通退出时，用两个不同十进制常量做eq恒假比较。',
    );
    fields.tradePlan = generatedTradePlanSchema
      .describe(
        '逐项落实当前需求，不能写完第一条保护就结束对象。要求初始保护和盈利后追踪时，两条分别写initialStop和trailing，盈利门槛写trailing.activationGainPercent；要求平仓后等待时必须写cooldown。这些字段在通用能力中可省略，不代表本次已明确要求的控制可以丢掉。结束对象前逐项核对intentCheck中的控制均已配置；未要求的控制不附加。',
      )
      .optional();
    fields.signalSources = z
      .array(
        z.strictObject({
          ...base.shape.signalSources.element.shape,
          series: z
            .array(
              c.instrument.assetType === 'fund'
                ? z.literal('nav')
                : seriesFieldSchema.exclude(['nav']),
            )
            .min(1)
            .describe(
              '声明全部实际依赖。只要该来源供初始 entryAtr、逐期 currentAtr 或 ATR 指标使用，就必须同时包含 high、low、close；不能因为普通入场和退出只用 close 而遗漏 high、low。',
            ),
          asset: frozenField(c.instrument),
          timeframe: frozenField(c.timeframe),
          priceCoordinate: (c.instrument.assetType === 'fund'
            ? z.literal('native-nav')
            : z.enum(['research', 'actual', 'run'])
          ).describe(
            '具体价格常量条件可用 actual；ATR保护来源必须 research 或 run，不能因以成交价为锚点而选 actual。',
          ),
        }),
      )
      .min(1);
  }
  if (input.requirementIds) return linkedProposal(fields, input.requirementIds, base);
  // 没有操作需求列表的通用调用保留原格式。
  const { tradePlan, ...remainingFields } = fields;
  const definition =
    tradePlan instanceof z.ZodOptional
      ? z.union([
          z.strictObject({ tradePlan: tradePlan.unwrap(), ...remainingFields }),
          z.strictObject(remainingFields),
        ])
      : z.strictObject(fields);
  return z.strictObject({
    coverage: authoringGenerationOutputSchema.shape.coverage,
    definition: definition.superRefine((value, ctx) => {
      const result = base.safeParse(value);
      if (!result.success)
        for (const issue of result.error.issues)
          ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }),
  });
}
