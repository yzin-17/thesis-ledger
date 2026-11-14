import { describe, expect, it } from 'vitest';
import { positionInputSchema, positionSymbolPattern } from '../src/index.js';
const input = { accountId: '11111111-1111-4111-8111-111111111111', quantity: '0.00000000000000000001',
  costPrice: '999999999999999.1234567890123456789', source: 'manual' as const, assetType: 'stock' as const };

describe('跨市场持仓规范代码', () => {
  it.each(['00700.HK','AAPL.US','BRK.B.US','600036.SH','000001.SZ','430047.BJ','000001.OF'])('接受 %s 并保留原始十进制', (symbol) => {
    expect(positionInputSchema.parse({ ...input, symbol })).toMatchObject({ ...input, symbol });
    expect(new RegExp(`^${positionSymbolPattern}$`,'v').test(symbol)).toBe(true);
  });
  it.each(['00000.HK','700.HK','^GSPC.US','aapl.us','AAPL.JP','AAPL','600036.SH.US!'])('拒绝无效代码 %s', (symbol) => {
    expect(positionInputSchema.safeParse({ ...input, symbol }).success).toBe(false);
  });
});
