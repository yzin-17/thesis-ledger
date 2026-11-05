import type {
  ResearchObservationEvaluation,
  ResearchObservationStatistics,
} from '@thesis-ledger/schemas';

const reasons: Record<ResearchObservationEvaluation['reasons'][number], string> = {
  ambiguous_claims: '同一报告在相同标的及窗口中存在相互矛盾的方向，未计入可计算样本。',
  unsupported_claim: '此论点不适用自动价格方向复核。',
  legacy_result: '旧报告缺少自动复核字段。',
  result_unavailable: '保存的结果无法核验。',
  calendar_unqualified: '现行日历尚不具备本次复核资格。',
  calendar_incomplete: '日历没有完整覆盖固定观察窗口。',
  calendar_unavailable: '本次未能读取合格日历。',
  not_due: '上次复核时观察窗口尚未到期。',
  price_unavailable: '未能读取固定窗口的经济价格。',
  price_missing: '固定起止日存在缺价，观察窗口保持原样。',
  suspended: '固定起止日存在停牌资料，结果保持未知。',
  price_basis_unknown: '经济价格的复权或分红口径尚未核实。',
  price_basis_mismatch: '价格资料与请求的标的或来源口径不一致。',
  coverage_incomplete: '价格覆盖、交易状态或可见时间仍有未知项。',
  source_unavailable: '本次所需来源不可用。',
};
export const observationReasonLabel = (reason: ResearchObservationEvaluation['reasons'][number]) =>
  reasons[reason];
export function observationRateLabel(rate: string | null) {
  if (rate === null) return '未知';
  return new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 }).format(
    Number(rate),
  );
}
export function observationSampleLabel(value: ResearchObservationStatistics) {
  if (value.sampleStatus === 'incomplete') return '统计范围未完整';
  if (value.sampleStatus === 'insufficient') return '样本不足';
  return '描述性统计';
}
