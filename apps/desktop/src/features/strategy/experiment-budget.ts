import { optimizationBudgetLimits, optimizationBudgetSchema } from '@thesis-ledger/schemas';
import { requestFailureMessage } from '@/shared/api/request-error';

export const experimentBudgetLabels = {
  maxAiCalls: 'AI 调用上限',
  maxBacktestRuns: '回测次数上限',
  maxInputTokens: '输入 Token 上限',
  maxOutputTokens: '输出 Token 上限',
  maxDurationSeconds: '时长上限（秒）',
} as const;
export type ExperimentBudgetField = keyof typeof experimentBudgetLabels;
export type ExperimentBudgetDraft = Record<ExperimentBudgetField, string>;

export function experimentBudgetRangeMessage(field: ExperimentBudgetField) {
  const limits = optimizationBudgetLimits[field];
  if ('unlimited' in limits)
    return `${experimentBudgetLabels[field]}填 ${limits.unlimited} 表示不限制，或填写 ${limits.min.toLocaleString('zh-CN')}–${limits.max.toLocaleString('zh-CN')} 之间的整数`;
  return `${experimentBudgetLabels[field]}须为 ${limits.min.toLocaleString('zh-CN')}–${limits.max.toLocaleString('zh-CN')} 之间的整数`;
}

export function experimentBudgetError(input: unknown) {
  const parsed = optimizationBudgetSchema.safeParse(input);
  if (parsed.success) return null;
  return [
    ...new Set(
      parsed.error.issues.map((issue) => {
        const field = String(issue.path[0]);
        if (field in experimentBudgetLabels)
          return experimentBudgetRangeMessage(field as ExperimentBudgetField);
        if (field === 'maxCost') return '费用上限须为有效的非负金额';
        return '请核对实验预算配置';
      }),
    ),
  ].join('；');
}

export function experimentCreateFailure(error: unknown) {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    const messages = error.issues.map((issue: { path?: unknown[]; message?: string }) => {
      if (issue.message && /[\u3400-\u9fff]/u.test(issue.message)) return issue.message;
      const [group, field] = issue.path ?? [];
      if (group === 'budget' && typeof field === 'string' && field in experimentBudgetLabels)
        return experimentBudgetRangeMessage(field as ExperimentBudgetField);
      if (group === 'budget' && field === 'maxCost') return '费用上限须为有效的非负金额';
      if (group === 'runConfig') return '已准备的实验配置不符合要求，请重新准备实验配置';
      if (group === 'models') return '所选模型配置不符合要求，请重新选择模型';
      return '实验输入不符合要求，请核对标的、区间和预算';
    });
    return [...new Set(messages)].join('；');
  }
  return requestFailureMessage(error, '创建实验失败，请使用同一提交意图重试。');
}
