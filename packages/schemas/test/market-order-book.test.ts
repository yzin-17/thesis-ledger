import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { orderBookRequestResponseV1Schema, orderBookV1Schema } from '../src/market-order-book.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/order-book-v1.json', import.meta.url), 'utf8'));

describe('隔离盘口合同', () => {
  it('读取跨仓同一样例，保持精确单位和两个独立时钟', () => {
    const parsed = orderBookRequestResponseV1Schema.parse(fixture);
    expect(parsed.response.bids[0]?.quantity).toBe('1000');
    expect(parsed.response.sourceEventTime).not.toBe(parsed.response.receivedAt);
  });

  it.each([
    { bids: [...fixture.response.bids].reverse() },
    { asks: [fixture.response.asks[0], fixture.response.asks[0]] },
    { sourceEventTime: '2026-10-09T08:00:00' },
    { sequence: null, continuity: 'verified' },
    { sourceDepthLimit: 1, depthDegraded: false },
    { bids: [{ price: '0', quantity: '1', orderCount: null }] },
    { quantityUnit: 'lot' },
    { venue: ' ' },
    { symbol: ' 00700.HK' },
    { symbol: 'HK.00700' },
    { market: 'US' },
    { receivedAt: '2026-10-09 08:00:00+00:00' },
    { bids: [{ price: '1', quantity: '1', orderCount: Number.MAX_SAFE_INTEGER + 1 }] },
  ])('拒绝错误语义 %j', (fields) => {
    expect(orderBookV1Schema.safeParse({ ...fixture.response, ...fields }).success).toBe(false);
  });

  it('空盘口、未知单位和缺来源时间保持真实未知', () => {
    const book = orderBookV1Schema.parse({ ...fixture.response, bids: [], asks: [], quantityUnit: 'unknown', sourceEventTime: null, sequence: null });
    expect(book.continuity).toBe('unknown');
  });

  it('高精度价位按十进制精确排序', () => {
    expect(orderBookV1Schema.safeParse({ ...fixture.response, bids: [
      { price: '1.0000000000000000002', quantity: '1', orderCount: null },
      { price: '1.0000000000000000001', quantity: '1', orderCount: null },
    ] }).success).toBe(true);
  });
});
