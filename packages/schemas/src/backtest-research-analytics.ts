import { z } from 'zod';

export const researchAnalyticsVersionSchema = z.literal('research-analytics-v2');

/** 缺版本的旧结果保持原解码；新结果不能声称版本却遗漏必要指标。 */
export function validateResearchAnalytics(
  result: { analyticsVersion?: 'research-analytics-v2' | undefined; metrics: Record<string, unknown> },
  context: z.RefinementCtx,
) {
  if (!result.analyticsVersion) return;
  for (const key of ['tradedNotional', 'turnoverRate']) {
    if (!result.metrics[key]) context.addIssue({ code: 'custom', path: ['metrics', key],
      message: '新版分析必须包含成交额与区间双边资金周转率' });
  }
}
