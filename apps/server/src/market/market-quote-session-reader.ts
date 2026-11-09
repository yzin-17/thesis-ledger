import { projectMarketSession, projectQuoteSessionFromMarketState, tradingMarketForAssetMarket } from '@thesis-ledger/domain';
import type { Quote, MarketQuoteSession } from '@thesis-ledger/schemas';
import type { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketSessionReader } from './market-session-reader.js';

/** 报价只负责来源时点覆盖；市场开闭市统一由共享日历读取器提供。 */
export class MarketQuoteSessionReader {
  private readonly sessions: MarketSessionReader | undefined;
  constructor(reader?: MarketPeriodCalendarReader, sessions?: MarketSessionReader) {
    this.sessions = sessions ?? (reader ? new MarketSessionReader(reader) : undefined);
  }
  async read(quote: Quote, now = new Date(Date.now())): Promise<MarketQuoteSession> {
    const market = tradingMarketForAssetMarket(quote.symbol.split('.').at(-1) ?? '');
    const state = market && this.sessions ? await this.sessions.read(market, now) : projectMarketSession(null, now);
    return projectQuoteSessionFromMarketState(quote, state);
  }
}
