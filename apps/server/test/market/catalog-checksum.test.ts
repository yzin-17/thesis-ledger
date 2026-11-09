import { expect, it } from 'vitest';
import { stableCatalogChecksum } from '../../src/market/instruments/catalog-checksum.js';

it('与 Python 元组排序及 UTF-8 JSON 的校验值一致，覆盖变长和带分隔符的美股代码', () => {
  const items = [
    { canonicalCode: 'A', market: 'US', instrumentType: 'STOCK', displayName: '安捷伦' },
    { canonicalCode: 'A.A', market: 'US', instrumentType: 'STOCK', displayName: '类别 A' },
    { canonicalCode: 'A-A', market: 'US', instrumentType: 'STOCK', displayName: '连字符' },
    { canonicalCode: 'AA', market: 'US', instrumentType: 'STOCK', displayName: '美国铝业' },
    { canonicalCode: '00001', market: 'HK', instrumentType: 'STOCK', displayName: '长和' },
    { canonicalCode: '510300', market: 'SH', instrumentType: 'ETF', displayName: '沪深300ETF' },
  ];
  // Python: sha256(json.dumps(sorted(items, key=(code,market,type)), ensure_ascii=False,
  //                         sort_keys=True, separators=(',', ':')).encode()).hexdigest()
  const expected = 'e530b541a6ad2a7eabab7f4ec5b2132e876dc0c9c33732179788e0e7a13d3e71';
  expect(stableCatalogChecksum(items)).toBe(expected);
  expect(stableCatalogChecksum([...items].reverse())).toBe(expected);
  expect(items[0]?.canonicalCode).toBe('A');
});
