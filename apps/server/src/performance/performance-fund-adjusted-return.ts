import { tradingCalendars, tradingMarketForAssetMarket } from '@thesis-ledger/domain';
import type { SourcePriceBasisFact } from '@thesis-ledger/schemas';
import type { MarketService } from '../market/market.service.js';
import type { MarketBarReader } from '../market/market-bar-reader.js';
import { fundHoldingReturn } from './performance-fund-price-evidence.js';

export type FundHoldingPriceEvidence = {
  symbol: string;
  status: 'available' | 'unavailable';
  reasonCode?: string;
  quoteMarketTime?: string | null;
  quoteTradingDate?: string;
  anchorDate?: string;
  anchorAdjustedClose?: number;
  currentAdjustedClose?: number;
  currentCompletionStatus?: string;
  inputFingerprint?: string;
  sourcePriceBasis?: SourcePriceBasisFact;
};

const marketParts = (at: Date, timezone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
};
const symbolMarket = (symbol: string) =>
  tradingMarketForAssetMarket(symbol.split('.').at(-1) ?? '');

/** 报价观察发生在盘前或休市日时，价格属于上一已开市交易日。 */
export function fundQuoteTradingDate(symbol: string, marketTime: string) {
  const market = symbolMarket(symbol);
  if (!market || !Number.isFinite(Date.parse(marketTime))) return undefined;
  const calendar = tradingCalendars[market];
  let { day, minute } = marketParts(new Date(marketTime), calendar.timezone);
  for (let lookback = 0; lookback < 31; lookback += 1) {
    // 各支持市场的本地日期在 UTC 正午保持同一天，避免美国落到前一日。
    const noon = new Date(day + 'T12:00:00Z');
    const status = calendar.status(noon);
    if (status.reason === 'calendar-unavailable') return undefined;
    const first = calendar.sessionsForDate(noon)[0];
    if (status.open && first && minute >= first.start) return day;
    noon.setUTCDate(noon.getUTCDate() - 1);
    day = noon.toISOString().slice(0, 10);
    minute = 24 * 60;
  }
  return undefined;
}

/** 两个价格始终位于同一份原生 qfq 序列，不推断 Quote 转换因子。 */
export async function readFundAdjustedHoldingReturn(input: {
  symbol: string;
  assetType: 'STOCK' | 'ETF';
  navDate: string;
  at: Date;
  market: Pick<MarketService, 'getQuote'>;
  bars: Pick<MarketBarReader, 'readChartV3'>;
}): Promise<{ change?: number; evidence: FundHoldingPriceEvidence }> {
  const evidence: FundHoldingPriceEvidence = { symbol: input.symbol, status: 'unavailable' };
  const unavailable = (reasonCode: string) => ({ evidence: { ...evidence, reasonCode } });
  try {
    const quote = await input.market.getQuote(input.symbol, { allowStale: true });
    if (quote.symbol !== input.symbol) return unavailable('quote_identity_mismatch');
    evidence.quoteMarketTime = quote.marketTime;
    if (fundHoldingReturn(quote.price, 1) === undefined)
      return unavailable('quote_price_unavailable');
    const upper = Math.floor(input.at.getTime() / 60_000) * 60_000 + 60_000;
    if (!quote.marketTime || !Number.isFinite(Date.parse(quote.marketTime)))
      return unavailable('quote_market_time_unknown');
    if (Date.parse(quote.marketTime) >= upper) return unavailable('quote_after_valuation_minute');
    const tradingDate = fundQuoteTradingDate(input.symbol, quote.marketTime);
    if (!tradingDate) return unavailable('quote_calendar_unavailable');
    evidence.quoteTradingDate = tradingDate;
    const anchorDate = input.navDate.slice(0, 10);
    evidence.anchorDate = anchorDate;
    if (tradingDate < anchorDate) return unavailable('quote_before_nav_anchor');
    const start = new Date(anchorDate + 'T00:00:00Z');
    start.setUTCDate(start.getUTCDate() - 7);
    const series = await input.bars.readChartV3({
      identity: {
        symbol: input.symbol,
        assetType: input.assetType,
        timeframe: '1d',
        adjustment: 'qfq',
      },
      window: { start: start.toISOString(), end: tradingDate + 'T23:59:59.999Z' },
      acceptance: 'interactive',
    });
    const basis = series.chartContextV3?.sourcePriceBasis;
    if (
      series.identity.symbol !== input.symbol ||
      series.identity.assetType !== input.assetType ||
      series.identity.timeframe !== '1d' ||
      series.identity.adjustment !== 'qfq' ||
      basis?.adjustment !== 'qfq'
    )
      return unavailable('adjusted_price_basis_unknown');
    if (Date.parse(basis.observedAt) >= upper || Date.parse(series.provenance.fetchedAt) >= upper)
      return unavailable('adjusted_basis_after_valuation_minute');
    const market = symbolMarket(input.symbol);
    if (!market) return unavailable('quote_calendar_unavailable');
    const timezone = tradingCalendars[market].timezone;
    const onDay = (day: string) =>
      series.points.filter((point) => marketParts(new Date(point.timestamp), timezone).day === day);
    const anchors = onDay(anchorDate),
      currents = onDay(tradingDate);
    if (anchors.length !== 1 || currents.length !== 1)
      return unavailable('adjusted_price_date_missing');
    const anchor = anchors[0]!,
      current = currents[0]!;
    if (Date.parse(anchor.availableAt) >= upper || Date.parse(current.availableAt) >= upper)
      return unavailable('adjusted_price_after_valuation_minute');
    const change = fundHoldingReturn(current.close, anchor.close);
    if (change === undefined) return unavailable('adjusted_price_unavailable');
    return {
      change,
      evidence: {
        ...evidence,
        status: 'available',
        anchorAdjustedClose: anchor.close,
        currentAdjustedClose: current.close,
        currentCompletionStatus: current.completionStatus,
        inputFingerprint: series.inputFingerprint,
        sourcePriceBasis: basis,
      },
    };
  } catch {
    return unavailable('adjusted_price_read_unavailable');
  }
}
