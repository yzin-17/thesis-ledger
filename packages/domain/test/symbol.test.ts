import { describe, expect, it } from 'vitest';
import { normalizeSymbol } from '../src/index.js';

describe('证券代码标准化', () => {
  it.each([
    ['600519', '600519.SH', 'stock'],
    ['SZ000001', '000001.SZ', 'stock'],
    ['510300.SH', '510300.SH', 'etf'],
    ['159919', '159919.SZ', 'etf'],
    ['830799', '830799.BJ', 'stock'],
  ])('%s → %s', (input, symbol, assetType) =>
    expect(normalizeSymbol(input)).toMatchObject({ symbol, assetType }),
  );
  it.each(['123', 'ABCDEF', '700000', '600519.HK'])('拒绝非法代码 %s', (input) =>
    expect(() => normalizeSymbol(input)).toThrow(),
  );
});
