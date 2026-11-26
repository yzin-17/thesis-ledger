import { Inject, Injectable } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketService } from './market.service.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { MarketActionCoverage } from './market-action-coverage.js';
import { readCnLiveExecution } from './market-cn-live-execution.js';
import { readHkLiveExecution } from './market-hk-live-execution.js';
import { readUsLiveExecution } from './market-us-live-execution.js';
import { readHkStockOrderReference } from './market-hk-stock-order-reference.js';
import { readSampledLiveExecution } from './market-sampled-live-execution.js';
export { executionSessionEnds } from './market-cn-live-execution.js';

export interface LiveExecutionScope {
  symbol: string;
  assetType: 'STOCK' | 'ETF';
  market: 'CN' | 'HK' | 'US';
  currency: 'CNY' | 'HKD' | 'USD';
  maxQuoteAgeSeconds: number;
  expiresOn: string[];
  previousDay?: string;
  simulationPolicy?: 'sampled-v1';
  needsBuySettlement?: boolean;
}

/** 当前执行输入按市场读取，身份、观察与制度分别核验。 */
@Injectable()
export class MarketLiveExecutionReader {
  constructor(
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getSession' | 'getQuote'>,
    @Inject(MarketPeriodCalendarReader)
    private readonly calendars: Pick<MarketPeriodCalendarReader, 'read'>,
    @Inject(MarketLifecycleReaderV3)
    private readonly status: Pick<MarketLifecycleReaderV3, 'readComposition'>,
    @Inject(MarketActionCoverage) private readonly actions: Pick<MarketActionCoverage, 'read'>,
    @Inject(DsaClient)
    private readonly dsa: Pick<
      DsaClient,
      'backtestInstrumentFacts' | 'post' | 'get' | 'effectiveControlPolicyV3' | 'marketPublicFeesV3'
    >,
  ) {}

  hkStockOrderReference(
    symbol: string,
    quote: Awaited<ReturnType<MarketService['getQuote']>>,
    at = new Date(),
  ) {
    return readHkStockOrderReference(this.dsa, symbol, quote, at);
  }

  async read(i: LiveExecutionScope, at = new Date()) {
    const session = await this.market.getSession(i.market, at);
    if (session.state !== 'open' || !session.date)
      return { status: 'unavailable' as const, reason: session.reason ?? 'market_closed' };
    if (i.simulationPolicy === 'sampled-v1')
      return readSampledLiveExecution({ market: this.market, calendars: this.calendars,
        actions: this.actions, dsa: this.dsa }, i, at, session.date);
    if (i.market === 'US')
      return readUsLiveExecution(
        { market: this.market, calendars: this.calendars, actions: this.actions },
        i,
        at,
        session.date,
      );
    if (i.market === 'HK')
      return readHkLiveExecution(
        { market: this.market, status: this.status, dsa: this.dsa },
        i,
        at,
        session.date,
      );
    if (i.assetType !== 'STOCK')
      return { status: 'unavailable' as const, reason: 'live_tradability_unavailable' };
    return readCnLiveExecution(
      {
        market: this.market,
        calendars: this.calendars,
        status: this.status,
        actions: this.actions,
        dsa: this.dsa,
      },
      i,
      at,
      session.date,
    );
  }
}
