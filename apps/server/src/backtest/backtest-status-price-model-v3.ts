import {
  backtestExecutionModelSchemaV3,
  compareMarketPitEvidenceInstantStringsV1,
  type MarketTradingStatusResponseV3,
  type BacktestExecutionModelV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { validateIntradayStatusV3 } from './backtest-intraday-status-v3.js';
import { validateListingStatusV3 } from './backtest-listing-status-v3.js';

/** 来源限制与已选模型求交；风险警示本身不生成停牌或未知费率。 */
export function statusPriceExecutionModelV3(
  config: RunConfigV3,
  response: MarketTradingStatusResponseV3,
  model: BacktestExecutionModelV3 | undefined = config.executionModel,
): BacktestExecutionModelV3 | undefined {
  validateIntradayStatusV3(config, response);
  validateListingStatusV3(config, response);
  if (!response.days.some((day) => day.dailyPriceLimit || day.noDailyPriceLimit)) return model;
  if (
    !model ||
    !config.executionPriceProtocol.marketRuleResearch ||
    config.executionPriceProtocol.priceBasis.adjustment !== 'none' ||
    config.executionPriceProtocol.priceBasis.quantityBasis !== 'actual-units' ||
    config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot' ||
    response.symbol !== model.scope.symbol ||
    response.routeKey.market !== model.scope.market ||
    response.range.start !== config.startDate ||
    response.range.end !== config.endDate
  ) {
    throw new Error('来源日涨跌幅需要同一标的/窗口的显式原价规则研究');
  }
  for (const document of response.sourceDocuments) {
    if (!document.observedAt) continue;
    const order = compareMarketPitEvidenceInstantStringsV1(document.observedAt, config.dataAsOf);
    if (order === undefined || order > 0) throw new Error('状态原件核验晚于冻结截点');
  }
  for (const day of response.days) {
    if (!day.dailyPriceLimit && !day.noDailyPriceLimit) continue;
    for (const id of day.sourceDocumentIds ?? []) {
      const document = response.sourceDocuments.find((item) => item.id === id);
      if (!document?.sha256 || !document.observedAt)
        throw new Error('价格限制缺少原件摘要或实际核验时钟');
    }
  }
  const segments: unknown[] = [];
  for (const original of model.segments) {
    if (original.execution.mode !== 'exchange') throw new Error('价格限制只适用于交易所执行');
    for (const day of response.days) {
      if (day.date < original.range.start || day.date > original.range.end) continue;
      const limit = day.dailyPriceLimit;
      let execution = original.execution;
      if (day.noDailyPriceLimit)
        execution = { ...execution, price: { kind: 'noDailyLimit', reason: day.noDailyPriceLimit.reason } };
      else if (limit)
        execution = {
          ...execution,
          price: {
            kind: 'dailyLimit',
            ...limit,
            rounding: 'halfUpToTick',
            minimumDistanceTicks: 1,
            minimumPriceTicks: 1,
          },
        };
      segments.push({
        ...original,
        id: `${original.id}:status:${day.date}`,
        range: { start: day.date, end: day.date },
        execution,
        source: {
          kind: 'userConfiguration',
          configuredAt: response.provenance.fetchedAt,
          historicalKnownAt:
            original.source.kind === 'historicalFact'
              ? original.source.knownAt
              : original.source.historicalKnownAt,
          revision: `${original.source.revision}:${response.provenance.providerRevision}`,
          description: '显式原价模型与已冻结状态/涨跌幅来源组合',
          references: [
            ...original.source.references,
            ...response.sourceDocuments.map((doc) => doc.url),
          ],
        },
        assumptions: [
          ...original.assumptions,
          '来源限制按原始前收盘和已选单位/tick执行；未知维度沿用原模型，历史首次可见时钟未验证。',
        ],
      });
    }
  }
  return backtestExecutionModelSchemaV3.parse({
    ...model,
    scope: { ...model.scope, range: response.range },
    version: `${model.version}:${response.days.some((day) => day.noDailyPriceLimit) ? 'frozen-listing-price-limits-v1' : 'frozen-risk-price-limits-v1'}:${response.provenance.providerRevision}`,
    segments,
  });
}
