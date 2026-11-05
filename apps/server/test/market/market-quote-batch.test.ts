import { describe, expect, it, vi } from 'vitest';
import { quoteSchema, type MarketQuoteIdentity } from '@thesis-ledger/schemas';
import { readQuoteBatch, quoteBatchFailure } from '../../src/market/market-quote-batch.js';
import { MarketQuotesController } from '../../src/market/market-quotes.controller.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';

const identity = (number = 0): MarketQuoteIdentity => ({
  symbol: `${600000 + number}.SH`,
  assetType: 'STOCK',
});
const quote = (symbol: string, stale = false) =>
  quoteSchema.parse({
    version: 3,
    symbol,
    open: 10,
    high: 12,
    low: 9,
    price: 11,
    previousClose: 10,
    volume: 100,
    amount: 1100,
    stale,
    provider: 'controlled',
    marketTime: '2026-11-04T07:00:00Z',
    fetchedAt: '2026-11-04T07:00:00Z',
    freshness: stale ? 'stale' : 'delayed',
  });

describe('显式批量报价', () => {
  it('按规范身份去重并保留首次顺序，失败不取消其他证券', async () => {
    const error = new DsaError('controlled', 'control-rejected', 422, 'not_selected');
    const read = vi.fn(async (symbol: string) => {
      if (symbol === identity(1).symbol) throw error;
      return quote(symbol, symbol === identity(2).symbol);
    });
    const inputs = [identity(0), identity(1), identity(0), identity(2)];
    const results = await readQuoteBatch(inputs, read);
    expect(results.map((result) => result.identity)).toEqual([
      identity(0),
      identity(1),
      identity(2),
    ]);
    expect(read).toHaveBeenCalledTimes(3);
    expect(results[1]!.outcome).toEqual({ status: 'rejected', reason: error });
    const controller = new MarketQuotesController({ getQuotes: async () => results } as never);
    expect(
      (await controller.quotes({ items: inputs })).results.map((result) => result.status),
    ).toEqual(['ready', 'unavailable', 'stale']);
    expect(quoteBatchFailure(error)).toEqual({ code: 'control-rejected', reason: 'not_selected' });
  });

  it('最多8条并发且每次只读取显式集合，不扫描证券目录', async () => {
    let active = 0,
      maximum = 0;
    const read = vi.fn(async (symbol: string) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return quote(symbol);
    });
    const results = await readQuoteBatch(
      Array.from({ length: 19 }, (_, index) => identity(index)),
      read,
    );
    expect(maximum).toBe(8);
    expect(results).toHaveLength(19);
    expect(read.mock.calls.map(([symbol]) => symbol)).toEqual(
      results.map((result) => result.identity.symbol),
    );
  });

  it('空批、超额、非法资产及未规范证券在任何调用前拒绝', async () => {
    const read = vi.fn();
    for (const items of [
      [],
      Array.from({ length: 101 }, () => identity()),
      [{ ...identity(), assetType: 'MUTUAL_FUND' }],
      [{ ...identity(), symbol: 'universe' }],
    ])
      await expect(readQuoteBatch(items as MarketQuoteIdentity[], read)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    const controller = new MarketQuotesController({ getQuotes: read } as never);
    await expect(controller.quotes({ items: [identity()], universe: true })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('撤销后不再调度下一组，错误证券不冒充成功', async () => {
    const controller = new AbortController();
    const read = vi.fn(async (symbol: string) => {
      controller.abort();
      return quote(symbol);
    });
    await expect(
      readQuoteBatch(
        Array.from({ length: 9 }, (_, index) => identity(index)),
        read,
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(8);
    const invalid = await readQuoteBatch([identity()], async () => quote(identity(1).symbol));
    expect(invalid[0]!.outcome.status).toBe('rejected');
  });
});
