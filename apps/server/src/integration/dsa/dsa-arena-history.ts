import { randomUUID } from 'node:crypto';
import { arenaHistoryCatalogSchema, arenaHistoryMinutesSchema, arenaHistoryInstrumentsSchema } from '@thesis-ledger/schemas';

type Read = (path: string, body: unknown) => Promise<unknown>;
export async function readArenaHistoryInstruments(read: Read, input: { market: 'CN'; date: string; query: string }) {
  const requestId = randomUUID();
  const result = arenaHistoryInstrumentsSchema.parse(await read('/api/v1/thesis-ledger/arena/history/instruments',
    { contractVersion: 1, consumer: 'thesis-ledger', requestId, ...input }));
  if (result.requestId !== requestId || result.date !== input.date || result.query !== input.query || result.market !== input.market)
    throw new Error('证券身份响应与请求不匹配');
  return result;
}
export async function readArenaHistoryCatalog(read: Read, input: { market: 'CN'; date: string }) {
  const requestId = randomUUID();
  const result = arenaHistoryCatalogSchema.parse(await read('/api/v1/thesis-ledger/arena/history/catalog',
    { contractVersion: 1, consumer: 'thesis-ledger', requestId, ...input }));
  if (result.requestId !== requestId || result.date !== input.date || result.market !== input.market) throw new Error('历史目录响应与请求不匹配');
  return result;
}
export type ArenaHistoryMinuteInput = { market: 'CN'; date: string; symbol: string; assetType: 'STOCK' | 'ETF'; timeframe?: '1m' | '5m' | '15m' | '30m' | '60m' };
export async function readArenaHistoryMinutes(read: Read, input: ArenaHistoryMinuteInput) {
  const requestId = randomUUID();
  const result = arenaHistoryMinutesSchema.parse(await read('/api/v1/thesis-ledger/arena/history/minutes',
    { contractVersion: 1, consumer: 'thesis-ledger', requestId, ...input }));
  if (result.requestId !== requestId || result.date !== input.date || result.value.symbol !== input.symbol || result.value.assetType !== input.assetType || result.value.market !== input.market || result.value.timeframe !== (input.timeframe ?? '1m'))
    throw new Error('历史分钟响应与请求不匹配');
  let previous = -Infinity;
  for (const point of result.value.rows) {
    const at = Date.parse(point.timestamp), finish = at + (result.value.timestampConvention === 'interval-start' ? parseInt(result.value.timeframe) * 60000 : 0);
    const tradingDay = new Date(at + 8 * 3600000).toISOString().slice(0, 10);
    if (at % 60000 || at <= previous || tradingDay !== input.date || at > Date.parse(result.value.observedAt) ||
      point.complete && finish > Date.parse(result.value.observedAt) || point.high < Math.max(point.open, point.low, point.close) || point.low > Math.min(point.open, point.high, point.close))
      throw new Error('历史分钟时点或价格无效');
    previous = at;
  }
  return result;
}
