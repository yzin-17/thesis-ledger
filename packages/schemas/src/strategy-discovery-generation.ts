import { z } from 'zod';
import {
  booleanExpressionSchema,
  riskRuleSchema,
  seriesFieldSchema,
  sizingRuleSchema,
} from './backtest-contract.js';
import { generatedTradePlanSchema } from './backtest-trade-plan-generation.js';
import { backtestDailyOrderExecutionSchema } from './backtest-daily-orders.js';
import { exchangeExecutionConfigSchema } from './backtest-strategy.js';
import { strategyCapabilityGapSchema } from './strategy-capability-gap.js';
import { backtestTimeframeSchema } from './backtest-values.js';

/** 模型生成规则及可选委托；固定标的、周期、成本和 SignalSource ID 由服务端装配。 */
export const optimizationDiscoveryGeneratedStrategySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    series: z
      .array(seriesFieldSchema)
      .min(1)
      .max(6)
      .describe(
        '声明全部实际依赖；entryAtr 或 currentAtr 必须包含 high、low、close，不能仅 close。',
      ),
    additionalSources: z
      .array(
        z.strictObject({
          id: z.string().trim().min(1).max(120),
          timeframe: backtestTimeframeSchema,
          series: z.array(seriesFieldSchema).min(1).max(6),
        }),
      )
      .max(5)
      .optional()
      .describe(
        '非主来源ID必须先在此声明id/timeframe/series，再在entry/exit引用相同ID。资产、价格坐标与主来源相同，禁止创建第二下单标的。',
      ),
    entry: booleanExpressionSchema,
    exit: booleanExpressionSchema,
    sizing: sizingRuleSchema,
    risk: z.array(riskRuleSchema).max(32),
    tradePlan: generatedTradePlanSchema.optional(),
    execution: z
      .union([exchangeExecutionConfigSchema, backtestDailyOrderExecutionSchema])
      .optional()
      .describe(
        '省略时沿用输入的inheritedExecution，也可原样显式填写普通后开盘市价配置。只有明确限价、触价、特殊有效期或父单保护时才选择dailyBarOrders及完整orders。',
      ),
  })
  .strict();

export const optimizationDiscoveryGenerationOutputSchema = z
  .object({
    strategy: optimizationDiscoveryGeneratedStrategySchema,
    reason: z.string().trim().min(1).max(2_000).optional(),
    evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .strict();

/** 新生成先写完整配置再回读说明；历史响应仍按原输出合同读取，文本不改交易含义。 */
export const optimizationDiscoveryGenerationWireSchema = z.strictObject({
  strategy: optimizationDiscoveryGeneratedStrategySchema,
  reason: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .describe(
      '在完整strategy之后，根据实际AST回读入场、普通退出、保护距离及启用、仓位和等待。不得声称配置了AST没有的过滤或保护，不增加优化假设或绩效。此说明不参与执行，也不能补写配置。',
    ),
  evidenceRefs: optimizationDiscoveryGenerationOutputSchema.shape.evidenceRefs,
});
export type OptimizationDiscoveryGenerationOutput = z.infer<
  typeof optimizationDiscoveryGenerationOutputSchema
>;
export const optimizationDiscoveryGenerationResultSchema = z.union([
  optimizationDiscoveryGenerationWireSchema,
  strategyCapabilityGapSchema,
]);
