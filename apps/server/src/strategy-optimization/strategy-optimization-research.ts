import { BadRequestException } from '@nestjs/common';
import {
  priceResearchStrategyIssues,
  runConfigSchemaV3,
  type BacktestStrategy,
  type RunConfigV3,
} from '@thesis-ledger/schemas';

export const LEGACY_RESEARCH_STRATEGY_SPACE_VERSION = 'strategy-space-price-research-v1';
export const RESEARCH_STRATEGY_SPACE_VERSION = 'strategy-space-price-research-v2';
export function usesOptimizationPriceResearch(config: unknown) {
  const parsed = runConfigSchemaV3.safeParse(config);
  return parsed.success && parsed.data.priceResearch?.protocolVersion === 'price-research-v1';
}
export function requireOptimizationPriceResearch(config: RunConfigV3, options: {
  legacy?: boolean; strategySpaceVersion?: string | null;
} = {}) {
  const legacy = options.strategySpaceVersion === LEGACY_RESEARCH_STRATEGY_SPACE_VERSION || options.legacy;
  if (!config.priceResearch || (legacy ? !config.priceResearch.actualPriceWindow :
    !config.frozenExecutionWindow || !config.priceResearch.dataScope ||
    (config.priceResearch.dataScope.priceCoordinates.includes('actual') && !config.priceResearch.actualPriceWindow)))
    throw new BadRequestException(
      legacy ? '旧实验仍要求原双价格冻结窗口，请按原合同恢复。' :
        '新实验需要已冻结的后复权研究窗口与本次数据能力范围，请重新准备实验配置。',
    );
}
export function requireOptimizationResearchStrategy(strategy: BacktestStrategy) {
  if (strategy.schemaVersion !== 'strategy-definition-v1')
    throw new BadRequestException('请先预览并确认策略的研究口径，保存新版本后再创建实验。');
  const issues = priceResearchStrategyIssues(strategy);
  if (issues.length) throw new BadRequestException(issues.map((issue) => issue.message).join('；'));
}
