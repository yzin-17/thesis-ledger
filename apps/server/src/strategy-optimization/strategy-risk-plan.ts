import { BadRequestException } from '@nestjs/common';
import { compileStrategyMonitoringPlan } from '@thesis-ledger/domain';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { optimizationSha256 } from './strategy-optimization-common.js';

export function validatedRiskStrategy(
  schema: unknown,
  schemaVersion: number,
  version: number,
): BacktestStrategy {
  if (schemaVersion !== 2 || version <= 0)
    throw new BadRequestException('风险应用只能来源于正式 V2 策略版本');
  const parsed = strategySchema.safeParse(schema);
  if (!parsed.success)
    throw new BadRequestException({
      errorCode: 'STRATEGY_RISK_APPLICATION_INVALID_STRATEGY',
      message: '正式策略版本不符合 V2 结构，无法安全编译风险监控规则',
    });
  return parsed.data as BacktestStrategy;
}

/** 仅编译真实账户支持的风险语义，不把离场价格或模拟仓位变成真实规则。 */
export function compileRiskApplicationPlan(strategy: BacktestStrategy, strategyVersionId: string) {
  const plan = compileStrategyMonitoringPlan(
    strategy,
    optimizationSha256(strategy),
    strategyVersionId,
  );
  if (plan.coverage.riskMapped !== plan.coverage.riskTotal) {
    throw new BadRequestException({
      errorCode: 'STRATEGY_RISK_APPLICATION_UNSUPPORTED_RULE',
      message: '策略包含尚未支持的风险规则，不能采纳为真实账户监控',
      unsupportedRiskRules: plan.coverage.items
        .filter((item) => item.category === 'risk' && item.status === 'unsupported')
        .map(({ source, reason }) => ({ source, reason })),
    });
  }
  return { ...plan, planHash: optimizationSha256({ ...plan, planHash: undefined }) };
}
