import type { PerformanceFxMeta, PerformanceSummary } from './performance.types.js';

const metricDisplay = (
  value: number | null | undefined,
  options: {
    allowed: boolean;
    readyDetail: string;
    reason: string | null | undefined;
    fallback: string;
    error: string | undefined;
    fx: PerformanceFxMeta | undefined;
  },
) => {
  const available =
    options.allowed && value !== null && value !== undefined && Number.isFinite(value);
  const display = { value: '—', detail: options.fallback };
  if (available) {
    display.value = `${(value * 100).toFixed(2)}%`;
    display.detail = options.readyDetail;
  }
  if (options.error) return { ...display, detail: options.error };
  if (!available && options.reason) return { ...display, detail: options.reason };
  if (options.fx?.status === 'stale')
    return { ...display, detail: '按当前汇率回算 · 估算 · 使用陈旧汇率' };
  if (options.fx?.status === 'blocked')
    return { ...display, detail: '无法获取汇率，暂不可计算合并收益' };
  return display;
};

export const performanceReturnDisplay = (
  summary: PerformanceSummary | null,
  snapshotCount: number,
  summaryError: string | undefined,
  fx: PerformanceFxMeta | undefined,
) => {
  const context = { error: summaryError, fx };
  const ttwror = metricDisplay(summary?.ttwror, {
    ...context,
    allowed: snapshotCount >= 2,
    readyDetail: '不混入外部现金流',
    reason: summary?.ttwrorReason ?? summary?.xirrReason,
    fallback: '需要 ≥ 2 个快照',
  });
  const xirr = metricDisplay(summary?.xirr, {
    ...context,
    allowed: true,
    readyDetail: '基于账本现金流',
    reason: summary?.xirrReason,
    fallback: snapshotCount < 2 ? '需要 ≥ 2 个现金流节点' : '现金流不足或无法收敛',
  });
  return {
    ttwrorValue: ttwror.value,
    ttwrorDetail: ttwror.detail,
    xirrValue: xirr.value,
    xirrDetail: xirr.detail,
  };
};
