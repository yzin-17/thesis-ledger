import type { StrategyCapabilityGap } from '@thesis-ledger/schemas';

/** 模型已完成并保存的能力报告；调用方不得把它变成候选或自动重试。 */
export class StrategyCapabilityGapError extends Error {
  constructor(readonly gap: StrategyCapabilityGap) {
    super(`能力缺口：${gap.reason}`);
    this.name = 'StrategyCapabilityGapError';
  }
}
