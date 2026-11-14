import {
  type journalAiFrozenEvidenceSchema,
  type journalPeriodAiFrozenEvidenceSchema,
  researchNumericFieldV2Schema,
  type ResearchFrozenEvidenceV2,
} from '@thesis-ledger/schemas';

type JournalObject = ReturnType<typeof journalAiFrozenEvidenceSchema.parse>;
type JournalPeriod = ReturnType<typeof journalPeriodAiFrozenEvidenceSchema.parse>;
type Metric = JournalObject['result']['metrics'][string];
type NumericField = ResearchFrozenEvidenceV2['numericFields'][number];

const pointer = (segment: string) => segment.replaceAll('~', '~0').replaceAll('/', '~1');

/** 只公布确定性算法已确认的可用数值，不能把草稿或未知字段升级为事实。 */
function metricFields(metrics: Record<string, Metric>, path: string): NumericField[] {
  return Object.entries(metrics).flatMap(([key, metric]) => {
    if (metric.status !== 'AVAILABLE') return [];
    const descriptor = researchNumericFieldV2Schema.safeParse({
      fieldPath: path + '/' + pointer(key) + '/value',
      unit: metric.unit.toLowerCase(),
      currency: metric.currency,
    });
    return descriptor.success ? [descriptor.data] : [];
  });
}

export function journalResearchNumericFields(data: JournalObject | JournalPeriod): NumericField[] {
  if (data.version === 'journal-review-ai-v1')
    return metricFields(data.result.metrics, '/result/metrics');
  return [
    ...metricFields(data.result.tradeCycles.metrics, '/result/tradeCycles/metrics'),
    ...metricFields(data.result.closeSlices.metrics, '/result/closeSlices/metrics'),
  ];
}
