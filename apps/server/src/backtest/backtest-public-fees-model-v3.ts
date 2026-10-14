import {
  backtestExecutionModelSchemaV3,
  publicFeesCompositionVersionV3,
  compareMarketPitEvidenceInstantStringsV1,
  type MarketPublicFeesResponseV3,
  type BacktestExecutionModelV3,
} from '@thesis-ledger/schemas';

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const charges = ['stampDuty', 'handlingFee', 'regulatoryFee', 'transferFee'] as const;

/** 将来源费率与已选模型求交；原模型保持独立冻结身份。 */
export const combinePublicFeesExecutionModelV3 = (
  model: BacktestExecutionModelV3,
  response: MarketPublicFeesResponseV3,
  dataAsOf?: string,
): BacktestExecutionModelV3 => {
  const scope = model.scope;
  if (response.segments.some((segment) => segment.charges.some((charge) => charge.basis === 'actualShares')) &&
    model.segments.some((segment) => segment.execution.mode === 'exchange' && segment.execution.normalizedExecution))
    throw new Error('实际股数公共收费不能绑定归一化数量');
  for (const document of response.sourceDocuments) {
    if (!document.sha256 && !document.observedAt) continue;
    const order =
      document.observedAt && dataAsOf
        ? compareMarketPitEvidenceInstantStringsV1(document.observedAt, dataAsOf)
        : undefined;
    if (
      !document.sha256 ||
      !document.observedAt ||
      (dataAsOf && (order === undefined || order > 0))
    )
      throw new Error('公共收费原件摘要/观察时钟缺失或晚于冻结截点');
  }
  if (
    scope.symbol !== response.symbol ||
    scope.market !== response.routeKey.market ||
    scope.instrumentType !== response.routeKey.assetType ||
    scope.range.start > response.range.start ||
    scope.range.end < response.range.end
  ) {
    throw new Error('公共收费与执行模型范围不一致');
  }
  let next = response.range.start;
  for (const segment of response.segments) {
    if (
      segment.range.start !== next ||
      segment.range.endExclusive > shiftDate(response.range.end, 1)
    ) {
      throw new Error('公共收费区间缺口、重叠或越界');
    }
    next = segment.range.endExclusive;
    if (
      (scope.market === 'CN' && segment.charges.length !== charges.length) ||
      new Set(segment.charges.map((charge) => charge.code)).size !== segment.charges.length ||
      segment.charges.some((charge) => charge.currency !== scope.currency)
    ) {
      throw new Error('公共收费缺少可计算的完整费项或币种不一致');
    }
  }
  if (next !== shiftDate(response.range.end, 1)) throw new Error('公共收费区间覆盖不足');
  const segments: unknown[] = [];
  for (const original of model.segments) {
    if (original.execution.mode !== 'exchange' || !original.fees) {
      throw new Error('公共收费仅适用于交易所执行模型');
    }
    for (const source of response.segments) {
      const start =
        original.range.start > source.range.start ? original.range.start : source.range.start;
      const sourceEnd = shiftDate(source.range.endExclusive, -1);
      const end = original.range.end < sourceEnd ? original.range.end : sourceEnd;
      if (start > end) continue;
      const fees: Record<string, unknown> = { ...original.fees };
      for (const charge of source.charges) {
        const selected = original.fees[charge.code];
        if (!selected || selected.treatment === 'notApplicable') {
          throw new Error('已选模型缺少公共费项的金额计算设置');
        }
        if (selected.treatment === 'charged') {
          fees[charge.code] = {
            ...selected,
            side: charge.side,
            basis: charge.basis,
            currency: charge.currency,
            rate: charge.rate,
            ...(charge.amountRounding ? { amountRounding: charge.amountRounding } : {}),
            ...(charge.maximumAmount ? { maximumAmount: charge.maximumAmount } : {}),
            ...(charge.lowPriceExemption ? { lowPriceExemption: charge.lowPriceExemption } : {}),
          };
        }
      }
      segments.push({
        ...original,
        id: `${original.id}:public-fees:${start}`,
        range: { start, end },
        fees,
        source: {
          kind: 'userConfiguration',
          configuredAt: response.provenance.fetchedAt,
          historicalKnownAt:
            original.source.kind === 'historicalFact'
              ? original.source.knownAt
              : original.source.historicalKnownAt,
          description: '已选执行模型与公共费率的本地研究组合',
          references: [
            ...original.source.references,
            ...response.sourceDocuments.map((document) => document.url),
          ],
          revision: `${original.source.revision}:${response.provenance.providerRevision}`,
        },
        assumptions: [
          ...original.assumptions,
          '佣金、规费包含关系、最低额、取整及扣收分组沿用已选执行模型。',
          '公共费率来源保留，历史首次可见时钟尚未验证。',
          ...(response.provenance.coverageDescription
            ? [response.provenance.coverageDescription]
            : []),
        ],
      });
    }
  }
  return backtestExecutionModelSchemaV3.parse({
    ...model,
    scope: { ...model.scope, range: response.range },
    version: `${model.version}:${publicFeesCompositionVersionV3}:${response.provenance.providerRevision}`,
    segments,
  });
};
