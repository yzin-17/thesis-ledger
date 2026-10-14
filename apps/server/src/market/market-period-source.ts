import { createHash } from 'node:crypto';
import { MarketPeriodAggregationError, type MarketPeriodDailyBar } from '@thesis-ledger/domain';
import {
  barSeriesSchema,
  canonicalBarSeriesEncoding,
  sourcePriceBasisSchema,
  type BarSeries,
} from '@thesis-ledger/schemas';
import {
  marketPitShanghaiTradingDateV3,
  compareDecisionClockV3,
} from './market-pit-decision-window-calendar-v3.js';

export const periodContentFingerprint = (encoding: string): string =>
  createHash('sha256').update(encoding).digest('hex');

/** 来源合同保持原生；这里只绑定周期视图必需的完整口径与实际日线。 */
export function bindPeriodSource(raw: BarSeries, evaluationAsOf: string) {
  const source = barSeriesSchema.parse(raw);
  const identity = source.identity;
  if (
    identity.timeframe !== '1d' ||
    (identity.assetType !== 'STOCK' && identity.assetType !== 'ETF') ||
    !/\.(SH|SZ|BJ)$/.test(identity.symbol)
  )
    throw new MarketPeriodAggregationError('invalid_input', '周期视图只接受 CN 股票/ETF 原生日线');
  if (!source.chartContextV3)
    throw new MarketPeriodAggregationError('price_basis_mismatch', '周期视图缺完整交互价格口径');
  const basis = sourcePriceBasisSchema.parse(source.chartContextV3.sourcePriceBasis);
  if (basis.adjustment !== identity.adjustment)
    throw new MarketPeriodAggregationError(
      'price_basis_mismatch',
      '来源复权与日线 identity 不一致',
    );
  if (
    compareDecisionClockV3(basis.observedAt, evaluationAsOf) > 0 ||
    compareDecisionClockV3(source.provenance.fetchedAt, evaluationAsOf) > 0
  )
    throw new MarketPeriodAggregationError('future_evidence', '来源口径观测晚于评估时刻');
  if (
    source.points.some(
      (point) =>
        compareDecisionClockV3(point.timestamp, evaluationAsOf) > 0 ||
        compareDecisionClockV3(point.availableAt, evaluationAsOf) > 0,
    )
  )
    throw new MarketPeriodAggregationError('future_evidence', '原生日线时刻或可用时刻晚于评估');
  const pointEncoding = canonicalBarSeriesEncoding(identity, source.points);
  if (periodContentFingerprint(pointEncoding) !== source.inputFingerprint)
    throw new MarketPeriodAggregationError('invalid_input', '原生日线输入摘要与实际点不一致');
  const priceBasisFingerprint = periodContentFingerprint(JSON.stringify(basis));
  const baseInputFingerprint = periodContentFingerprint(
    JSON.stringify([
      'market-period-base-v1',
      identity.symbol,
      identity.assetType,
      identity.timeframe,
      identity.adjustment,
      source.inputFingerprint,
      source.provenance.providerId,
      source.provenance.upstreamSource,
      source.provenance.providerRevision,
      source.provenance.effectivePolicyRevision,
      source.provenance.fetchedAt,
      source.chartContextV3.acquisitionFingerprint,
      priceBasisFingerprint,
      pointEncoding,
    ]),
  );
  const sourceAvailableAt =
    compareDecisionClockV3(basis.observedAt, source.provenance.fetchedAt) > 0
      ? basis.observedAt
      : source.provenance.fetchedAt;
  const bars: MarketPeriodDailyBar[] = source.points.map((point) => ({
    ...point,
    symbol: identity.symbol,
    tradingDate: marketPitShanghaiTradingDateV3(point.timestamp),
    adjustment: identity.adjustment,
    priceBasisFingerprint,
    availableAt:
      compareDecisionClockV3(point.availableAt, sourceAvailableAt) > 0
        ? point.availableAt
        : sourceAvailableAt,
  }));
  return { source, bars, priceBasisFingerprint, baseInputFingerprint };
}
