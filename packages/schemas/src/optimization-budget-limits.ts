/** 实验预算合同的数值范围，供校验与填写界面共同消费。 */
export const optimizationBudgetLimits = {
  maxAiCalls: { min: 1, max: 30, unlimited: 0 },
  maxBacktestRuns: { min: 2, max: 100, unlimited: 0 },
  maxInputTokens: { min: 1, max: 10_000_000, unlimited: 0 },
  maxOutputTokens: { min: 1, max: 2_000_000, unlimited: 0 },
  maxDurationSeconds: { min: 30, max: 86_400 },
} as const;
