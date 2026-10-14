import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  executionPriceProtocolSchema,
  type MarketDataBarSeriesResponseV3,
} from '@thesis-ledger/schemas';
import { executionBarRowsV3 } from '../../src/backtest/backtest-v3-execution-bar-rows.js';

const fixture = (name: string) => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8',
));
function input() {
  const protocol = fixture('execution-price.raw-events.json');
  protocol.history = { basis: 'fixed-provider-snapshot' };
  protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  const response = fixture('market-data-v3.response.etf-qfq.json') as MarketDataBarSeriesResponseV3;
  response.routeKey = { ...response.routeKey, market: 'US', assetType: 'STOCK', adjustment: 'none', timeframe: '1d' };
  for (const bar of response.bars) bar.amount = null;
  return { protocol: executionPriceProtocolSchema.parse(protocol), response };
}

describe('按股模拟成交额与来源市场总成交额', () => {
  it('显式美股原价规则研究冻结null，保留OHLCV，不估算来源成交额', () => {
    const { protocol, response } = input();
    const rows = executionBarRowsV3(response, 'GME.US', protocol);
    expect(rows[0]!.amount).toBeNull();
    expect(rows[0]!.close).toBe(String(response.bars[0]!.close));
    expect(rows[0]!.volume).toBe(String(response.bars[0]!.volume));
  });
  it('缺成交量、普通raw、现金研究、其他市场/资产/周期仍拒绝', () => {
    const { protocol, response } = input();
    const plain = { ...protocol }; delete plain.marketRuleResearch;
    const cash = { ...plain, cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1' as const };
    for (const value of [plain, cash, 'raw-events' as const])
      expect(() => executionBarRowsV3(response, 'GME.US', value)).toThrow('成交额');
    for (const patch of [{ market: 'HK' as const }, { assetType: 'ETF' as const }, { timeframe: '1m' as const }, { adjustment: 'qfq' as const }])
      expect(() => executionBarRowsV3({ ...response, routeKey: { ...response.routeKey, ...patch } }, 'GME.US', protocol)).toThrow('成交额');
    response.bars[0]!.volume = null;
    expect(() => executionBarRowsV3(response, 'GME.US', protocol)).toThrow('成交量');
  });
});
