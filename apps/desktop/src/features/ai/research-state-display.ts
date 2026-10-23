import type {
  ResearchReportSummary,
  ResearchReportObservations,
  ResearchReportComparison,
} from '@thesis-ledger/schemas';

export const researchStateMeta = {
  empty: { label: '尚无研究报告', description: '选择研究范围并准备资料，再确认是否开始研究。' },
  preparing: {
    label: '资料准备与提交待确认',
    description: '正在等待本次研究提交确认，可停止等待并保留提交标识。',
  },
  queued: { label: '等待研究执行', description: '状态来自服务端，完成后自动更新。' },
  running: { label: '研究进行中', description: '状态来自服务端，完成后自动更新。' },
  failed: { label: '研究失败', description: '核对原任务与资料后，可以使用原问题准备新研究。' },
  cancelled: { label: '研究已取消', description: '原任务与审计记录已保留。' },
  data_stale: {
    label: '资料尚待更新',
    description: '保存的资料已明确标记过期，请核对限制后重新准备。',
  },
  data_unknown: {
    label: '资料状态有未知项',
    description: '先核对保存的证据与缺失原因，需要新资料时重新准备。',
  },
  opinion_changed: {
    label: '观点字段有变化',
    description: '查看两份保存原文及引用，文字变化不自动代表结论反转。',
  },
  input_changed: { label: '输入资料有变化', description: '核对来源、资料版本及质量的实际差异。' },
  review_unrecorded: { label: '尚未复核', description: '按需读取合格资料并保存一次观察。' },
  review_pending: { label: '正在复核', description: '本次提交有界执行，重试会找回同一次尝试。' },
  review_not_due: { label: '观察窗口未到期', description: '到期后可显式提交下一次复核。' },
  review_due: { label: '已到期待复核', description: '上次观察尚未到期，现在可以按需重新复核。' },
  review_insufficient: {
    label: '复核资料不足',
    description: '保留原观察，资料补充后可提交下一次复核。',
  },
  review_completed: {
    label: '已计算方向复核',
    description: '查看固定交易日窗口和两端经济收盘价格。',
  },
  review_manual: { label: '自动复核不适用', description: '此论点请结合原报告与证据人工查看。' },
  completed: { label: '报告已保存', description: '可核对原文、展开报告比较或按需复核结构化断言。' },
  historical: { label: '历史范围未记录', description: '保留历史原文供人工查看。' },
  unavailable: {
    label: '报告暂不可用',
    description: '重新读取任务状态，并核对保存结果及引用关联。',
  },
} as const;
export function researchReportState(
  report: ResearchReportSummary | null,
  preparing = false,
): keyof typeof researchStateMeta {
  if (preparing) return 'preparing';
  if (!report) return 'empty';
  if (
    report.status === 'queued' ||
    report.status === 'running' ||
    report.status === 'failed' ||
    report.status === 'cancelled'
  )
    return report.status;
  if (report.historicalScope.status === 'unrecorded') return 'historical';
  if (report.availability !== 'available') return 'unavailable';
  if (report.quality?.reasons.includes('private_cash_projection_stale')) return 'data_stale';
  if (!report.quality || report.quality.status === 'partial') return 'data_unknown';
  return 'completed';
}
export function researchObservationState(
  item: ResearchReportObservations['items'][number],
  asOf: string,
): keyof typeof researchStateMeta {
  if (item.tradingDays === null) return 'review_manual';
  const current = item.current;
  if (!current) return 'review_unrecorded';
  const result = current.evaluation;
  if (result.status === 'completed') return 'review_completed';
  if (result.status === 'not_applicable') return 'review_manual';
  if (result.status === 'insufficient_data') return 'review_insufficient';
  if (result.window.endCloseAt !== null && Date.parse(result.window.endCloseAt) <= Date.parse(asOf))
    return 'review_due';
  return 'review_not_due';
}
export function researchComparisonState(comparison: ResearchReportComparison) {
  if (comparison.status !== 'compared') return null;
  if (comparison.groups.some((group) => group.key === 'opinion' && group.status === 'changed'))
    return 'opinion_changed' as const;
  if (comparison.groups.some((group) => group.key === 'inputs' && group.status === 'changed'))
    return 'input_changed' as const;
  return null;
}
