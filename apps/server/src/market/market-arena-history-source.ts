import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { arenaDateAt } from '@thesis-ledger/domain';
import type { ArenaHistoryMinutes, ArenaHistoryInstruments, ArenaLiveProtocol, BarPoint, BarSeriesIdentity } from '@thesis-ledger/schemas';
import { DsaClient, DSA_MARKET_INDICATOR_ENGINE_VERSION } from '../integration/dsa/dsa.client.js';
import { selectIndicatorParameters } from './market-indicator-request.js';
import { InstrumentService } from './instrument.service.js';

type ReplayInstrument = { instrumentId: string; symbol: string; name: string; assetType: 'STOCK' | 'ETF';
  identityEvidence?: Pick<ArenaHistoryInstruments, 'kind' | 'observedAt' | 'archiveRef' | 'responseSha256' | 'providerVersion' | 'historicalEligibility'> };

/** 历史重建资料的采集证据与回放可见投影。 */
@Injectable()
export class MarketArenaHistorySource {
  private readonly minutes = new Map<string, Promise<ArenaHistoryMinutes>>();
  private readonly discoveries = new Map<string, Promise<ArenaHistoryInstruments>>();
  constructor(
    @Inject(DsaClient) private readonly dsa: Pick<DsaClient, 'arenaHistoryMinutes'> & Partial<Pick<DsaClient, 'calculateIndicators' | 'arenaHistoryInstruments'>>,
    @Optional() @Inject(InstrumentService) private readonly instruments?: Pick<InstrumentService, 'search' | 'resolveCanonicalSymbols'>,
  ) {}
  async resolve(p: ArenaLiveProtocol, symbols: readonly string[], at: string) {
    const requested = [...new Set(symbols)];
    if (!requested.length) return [];
    if (p.universe === 'fixed') {
      const rows = p.instruments.filter((i) => requested.includes(i.symbol)).map((i) => ({ ...i, name: i.symbol }));
      if (rows.length !== requested.length) throw new Error('symbol_outside_universe');
      return rows;
    }
    const result = await this.instruments?.resolveCanonicalSymbols(requested);
    const rows: ReplayInstrument[] = (result?.items ?? []).flatMap((i) => i.market === p.market && (i.assetType === 'STOCK' || i.assetType === 'ETF')
      ? [{ instrumentId: i.instrumentId, symbol: i.symbol, assetType: i.assetType, name: i.symbol }] : []);
    for (const symbol of requested.filter((s) => !rows.some((i) => i.symbol === s))) {
      if (!this.dsa.arenaHistoryInstruments || p.market !== 'CN') throw new Error('symbol_outside_universe');
      const matches = (await this.discover(p, at, symbol)).filter((i) => i.symbol === symbol);
      if (matches.length !== 1) throw new Error('symbol_outside_universe');
      rows.push(matches[0]!);
    }
    if (requested.some((symbol) => !rows.some((i) => i.symbol === symbol))) throw new Error('symbol_outside_universe');
    return rows;
  }
  async search(p: ArenaLiveProtocol, query: string, at: string) {
    if (p.universe === 'fixed') return p.instruments.filter((i) => i.symbol.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20).map((i) => ({ ...i, name: i.symbol }));
    const rows = await this.instruments?.search(query, 20, {
      markets: p.market === 'CN' ? ['SH', 'SZ', 'BJ'] : [p.market], types: ['STOCK', 'ETF'],
    }) ?? [];
    const normalized = query.trim().toUpperCase();
    const numeric = /^\d{6}(?:\.(SH|SZ|BJ))?$/.test(normalized);
    const exact = rows.some((i) => i.symbol === normalized || i.canonicalCode === normalized);
    if ((!rows.length || numeric && !exact) && this.dsa.arenaHistoryInstruments && p.market === 'CN') return this.discover(p, at, query);
    return rows.flatMap((i) => i.instrumentType === 'STOCK' || i.instrumentType === 'ETF'
      ? [{ instrumentId: i.id, symbol: i.symbol, assetType: i.instrumentType, name: i.symbol }] : []);
  }
  private async discover(p: ArenaLiveProtocol, at: string, query: string): Promise<ReplayInstrument[]> {
    if (!this.dsa.arenaHistoryInstruments) throw new Error('replay_tools_unavailable');
    const date = arenaDateAt(at, p.timeZone);
    const result = await this.cached(this.discoveries, `${date}:${query}`, () => this.dsa.arenaHistoryInstruments!({ market: 'CN', date, query }));
    const { kind, observedAt, archiveRef, responseSha256, providerVersion, historicalEligibility } = result;
    return result.items.map((i) => {
      const hash = createHash('sha256').update(`arena-history:${p.market}:${i.symbol}:${i.assetType}`).digest('hex');
      const instrumentId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      return { ...i, instrumentId, identityEvidence: { kind, observedAt, archiveRef, responseSha256, providerVersion, historicalEligibility } };
    });
  }
  async prices(p: ArenaLiveProtocol, symbol: string, assetType: 'STOCK' | 'ETF', date: string, at: string,
    timeframe: '1m' | '5m' | '15m' | '30m' | '60m' = '1m') {
    if (p.market !== 'CN') throw new Error('replay_prices_unavailable');
    const raw = await this.cached(this.minutes, `${symbol}:${assetType}:${date}:${timeframe}`, () => this.dsa.arenaHistoryMinutes({ market: 'CN', symbol, assetType, date, timeframe }))
      .catch(() => { throw new Error('replay_prices_unavailable'); });
    const offset = raw.value.timestampConvention === 'interval-start' ? parseInt(timeframe) * 60000 : 0;
    const points: BarPoint[] = raw.value.rows.flatMap((row) => {
      const finish = Date.parse(row.timestamp) + offset;
      if (row.complete !== true || finish > Date.parse(at)) return [];
      const timestamp = new Date(finish).toISOString();
      return [{ timestamp, availableAt: timestamp, open: row.open, high: row.high, low: row.low, close: row.close,
        volume: row.volume, amount: row.amount, completionStatus: 'complete' as const }];
    });
    return { points, evidence: { kind: raw.kind, archiveRef: raw.archiveRef, observedAt: raw.value.observedAt,
      responseSha256: raw.value.responseSha256, providerId: raw.providerId, policyRevision: raw.policyRevision,
      timestampConvention: raw.value.timestampConvention }, seriesVersion: raw.value.responseSha256 };
  }
  async research(p: ArenaLiveProtocol, at: string, input: { symbol: string; timeframe: string; limit: number; indicator?: 'MA' | 'MACD' | 'RSI' }) {
    const timeframe = input.timeframe;
    if (timeframe !== '1m' && timeframe !== '5m' && timeframe !== '15m' && timeframe !== '30m' && timeframe !== '60m') throw new Error('replay_tools_unavailable');
    const instrument = (await this.resolve(p, [input.symbol], at))[0];
    if (!instrument) throw new Error('symbol_outside_universe');
    const series = await this.prices(p, input.symbol, instrument.assetType, arenaDateAt(at, p.timeZone), at, timeframe);
    const points = series.points.slice(-input.limit);
    if (!points.length) throw new Error('replay_prices_unavailable');
    const identity: BarSeriesIdentity = { symbol: input.symbol, assetType: instrument.assetType, timeframe, adjustment: 'none' };
    const inputFingerprint = createHash('sha256').update(JSON.stringify({ identity, points })).digest('hex');
    if (!input.indicator) return { asOf: at, identity, points, evidence: series.evidence, inputFingerprint };
    if (!this.dsa.calculateIndicators) throw new Error('replay_tools_unavailable');
    const calculated = await this.dsa.calculateIndicators({ identity, points, inputFingerprint,
      requests: [{ name: input.indicator, parameters: selectIndicatorParameters(input.indicator, undefined) }] });
    if (calculated.inputFingerprint !== inputFingerprint || calculated.engineVersion !== DSA_MARKET_INDICATOR_ENGINE_VERSION ||
      calculated.results.length !== 1 || calculated.results[0]?.name !== input.indicator ||
      calculated.results.some((r) => r.inputFingerprint !== inputFingerprint)) throw new Error('replay_tools_unavailable');
    return { asOf: at, evidence: series.evidence, ...calculated };
  }
  private async cached<T>(cache: Map<string, Promise<T>>, key: string, read: () => Promise<T>) {
    const existing = cache.get(key);
    if (existing) return existing;
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    const result = read();
    cache.set(key, result);
    try { return await result; } catch (error) { cache.delete(key); throw error; }
  }
}
