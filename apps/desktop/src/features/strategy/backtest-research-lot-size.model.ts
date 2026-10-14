import { backtestExecutionModelSchemaV3, securityLotReferenceSchema, type BacktestExecutionModelV3, type SecurityLotReference } from '@thesis-ledger/schemas';

const sourceLabels: Record<string, string> = {
  futu: '富途 OpenAPI', longbridge: '长桥 OpenAPI', 'webull-current-quote': '微牛公开资料',
};
export function researchLotSourceLabel(provider: string | null) {
  return provider ? sourceLabels[provider] ?? provider : '未记录';
}

export function applyResearchLotSize(model: BacktestExecutionModelV3, sharesPerLot: string,
  configuredAt = new Date().toISOString(), reference?: SecurityLotReference) {
  const next = structuredClone(model);
  if (reference) {
    const value = securityLotReferenceSchema.parse(reference);
    if (value.symbol !== model.scope.symbol) throw new Error('每手股数参考标的与执行模型不一致');
    next.researchLotSize = { sharesPerLot: value.sharesPerLot, defaultSharesPerLot: value.sharesPerLot,
      origin: 'providerCurrent', historicalChanges: 'unverified', source: { ...value.source, symbol: value.symbol } };
  }
  const preset = next.researchLotSize;
  if (!preset) throw new Error('请先查询每手股数，或保留已有的来源研究预设');
  next.researchLotSize = { ...preset, sharesPerLot,
    origin: sharesPerLot === preset.defaultSharesPerLot ? 'providerCurrent' : 'userOverride' };
  next.version = `${model.version}.lot-${sharesPerLot}`;
  next.segments = next.segments.map(segment => {
    if (segment.source.kind === 'historicalFact') throw new Error('每手预设不能改写历史事实模型');
    return { ...segment, source: { ...segment.source, kind: 'userConfiguration', configuredAt } };
  });
  return backtestExecutionModelSchemaV3.parse(next);
}
