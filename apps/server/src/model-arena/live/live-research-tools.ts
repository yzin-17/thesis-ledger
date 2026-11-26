import { Inject, Injectable, Optional } from '@nestjs/common';
import { MarketArenaReplayReader } from '../../market/market-arena-replay-reader.js';
import {
  arenaResearchToolRequestSchema,
  marketNewsDefaultWindowMs,
  type ArenaLiveProtocol,
} from '@thesis-ledger/schemas';
import { InstrumentService } from '../../market/instrument.service.js';
import { MarketService } from '../../market/market.service.js';
import { MarketResearchSeriesReader } from '../../market/market-research-series-reader.js';
import { MarketNewsReader } from '../../market/market-news-reader.js';
import { ResearchPublicSearch } from '../../ai/research-public-search.js';
import { MarketLiveExecutionReader } from '../../market/market-live-execution-reader.js';
import { readLiveResearchQuote, type LiveResearchExecution } from './live-research-quote.js';

@Injectable()
export class LiveResearchTools {
  constructor(
    @Inject(InstrumentService)
    private readonly instruments: Pick<InstrumentService, 'search' | 'resolveCanonicalSymbols'>,
    @Inject(MarketService) private readonly market: Pick<MarketService, 'getQuote'>,
    @Inject(MarketResearchSeriesReader)
    private readonly series: Pick<MarketResearchSeriesReader, 'read'>,
    @Inject(MarketNewsReader) private readonly news: Pick<MarketNewsReader, 'read'>,
    @Inject(ResearchPublicSearch) private readonly search: Pick<ResearchPublicSearch, 'read'>,
    @Optional()
    @Inject(MarketArenaReplayReader)
    private readonly replay?: Partial<
      Pick<MarketArenaReplayReader, 'quote' | 'search' | 'research'>
    >,
    @Optional()
    @Inject(MarketLiveExecutionReader)
    private readonly execution?: LiveResearchExecution,
  ) {}
  async execute(
    protocol: ArenaLiveProtocol,
    raw: unknown,
    signal: AbortSignal,
    asOf?: string,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const input = arenaResearchToolRequestSchema.parse(raw);
    if (asOf) {
      return this.executeReplay(protocol, input, asOf);
    }
    if (input.name === 'web_search') {
      if (!protocol.allowWebSearch) throw new Error('web_search_disabled');
      return this.search.read(input.query, protocol.market, signal);
    }
    if (input.name === 'search_instruments') {
      const rows = await this.instruments.search(input.query, 20, {
        markets: protocol.market === 'CN' ? ['SH', 'SZ', 'BJ'] : [protocol.market],
        types: ['STOCK', 'ETF'],
      });
      return {
        items: rows
          .filter(
            (r) =>
              protocol.universe === 'market' ||
              protocol.instruments.some((i) => i.instrumentId === r.id),
          )
          .map((r) => ({
            instrumentId: r.id,
            symbol: r.symbol,
            name: r.displayName,
            assetType: r.instrumentType,
          })),
      };
    }
    if (
      protocol.universe === 'fixed' &&
      !protocol.instruments.some((i) => i.symbol === input.symbol)
    )
      throw new Error('symbol_outside_universe');
    const identity = (await this.instruments.resolveCanonicalSymbols([input.symbol])).items.find(
      (i) =>
        i.symbol === input.symbol &&
        i.market === protocol.market &&
        (i.assetType === 'STOCK' || i.assetType === 'ETF'),
    );
    if (!identity || (identity.assetType !== 'STOCK' && identity.assetType !== 'ETF'))
      throw new Error('symbol_outside_universe');
    signal.throwIfAborted();
    if (input.name === 'quote')
      return readLiveResearchQuote(
        protocol,
        input.symbol,
        identity.assetType,
        signal,
        this.market,
        this.execution,
      );
    if (input.name === 'bars' || input.name === 'indicators')
      return this.series.read({
        symbol: input.symbol,
        assetType: identity.assetType,
        timeframe: input.timeframe,
        limit: input.limit,
        ...(input.name === 'indicators' ? { indicator: input.indicator } : {}),
      });
    if (input.name === 'news') {
      const end = new Date();
      return this.news.read(
        {
          instrument: {
            symbol: input.symbol,
            market: protocol.market,
            assetType: identity.assetType,
          },
          publishedStart: new Date(end.getTime() - marketNewsDefaultWindowMs).toISOString(),
          publishedEnd: end.toISOString(),
          limit: 5,
          requestBudgetMs: 5000,
        },
        signal,
      );
    }
    throw new Error('tool_not_connected');
  }
  private async executeReplay(
    protocol: ArenaLiveProtocol,
    input: ReturnType<typeof arenaResearchToolRequestSchema.parse>,
    asOf: string,
  ): Promise<unknown> {
    if ((input.name === 'bars' || input.name === 'indicators') && this.replay?.research)
      return this.replay.research(protocol, asOf, {
        symbol: input.symbol,
        timeframe: input.timeframe,
        limit: input.limit,
        ...(input.name === 'indicators' ? { indicator: input.indicator } : {}),
      });
    if (input.name === 'search_instruments' && this.replay?.search)
      return this.replay.search(protocol, asOf, input.query);
    if (input.name === 'search_instruments' && protocol.universe === 'fixed')
      return {
        items: protocol.instruments
          .filter((i) => i.symbol.toLowerCase().includes(input.query.toLowerCase()))
          .map((i) => ({ ...i, name: i.symbol })),
      };
    if (input.name !== 'quote' || !this.replay?.quote) throw new Error('replay_tools_unavailable');
    return this.replay.quote(protocol, asOf, input.symbol);
  }
}
