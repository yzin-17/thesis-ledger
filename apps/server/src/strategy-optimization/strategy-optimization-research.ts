import { BadRequestException } from '@nestjs/common';
import {
  priceResearchStrategyIssues,
  runConfigSchemaV3,
  type BacktestStrategy,
  type RunConfigV3,
} from '@thesis-ledger/schemas';

export const RESEARCH_STRATEGY_SPACE_VERSION = 'strategy-space-price-research-v1';
export function usesOptimizationPriceResearch(config: unknown) {
  const parsed = runConfigSchemaV3.safeParse(config);
  return parsed.success && parsed.data.priceResearch?.protocolVersion === 'price-research-v1';
}
export function requireOptimizationPriceResearch(config: RunConfigV3) {
  if (!config.priceResearch || !config.priceResearch.actualPriceWindow)
    throw new BadRequestException(
      '新实验需要统一后复权研究及已冻结的原价参考，请重新准备实验配置。',
    );
}
export function requireOptimizationResearchStrategy(strategy: BacktestStrategy) {
  if (strategy.schemaVersion !== '3')
    throw new BadRequestException('请先预览并确认策略的研究口径，保存新版本后再创建实验。');
  const issues = priceResearchStrategyIssues(strategy);
  if (issues.length) throw new BadRequestException(issues.map((issue) => issue.message).join('；'));
}
