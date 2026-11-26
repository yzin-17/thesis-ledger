import { describe, expect, it } from 'vitest';
import { marketReferenceCatalog, marketReferenceOptions } from '../src/market-reference-catalog.js';
import {
  correlateMarketReference,
  marketReferenceInputSchema,
  marketReferenceResultSchema,
} from '../src/market-reference.js';

const input = () =>
  marketReferenceInputSchema.parse({ dataset: 'financial-balance', symbol: '600519.SH' });
function page() {
  return {
    ...input(),
    requestBudgetMs: undefined,
    dataVersion: 'market-reference-v1',
    requestId: 'sample',
    contractVersion: 1,
    consumer: 'thesis-ledger',
    providerId: 'akshare',
    upstreamSource: 'sina',
    adapterRevision: 'market-reference-projection-v1',
    sourceRevision: 'sina-original-finance-report-v1',
    sourceUrl: 'https://quotes.sina.cn/',
    fetchedAt: '2026-11-03T12:00:00Z',
    columns: marketReferenceCatalog['financial-balance'].columns,
    status: 'ok',
    hasMore: false,
    nextCursor: null,
    historyComplete: false,
    totalSourceRecords: 1,
    policyRevision: 1,
    routeTarget: { providerId: 'akshare', upstreamSource: 'sina', routeIndex: 0 },
    notes: ['按来源原报表展示。'],
    items: [
      {
        id: 'a'.repeat(64),
        values: {
          period: '2026-09-30',
          publishedDate: '2026-10-31',
          basis: '合并期末',
          assets: '0',
          liabilities: '-1.25',
          parentEquity: null,
        },
      },
    ],
  };
}
function rawPage() {
  const raw = page();
  Reflect.deleteProperty(raw, 'requestBudgetMs');
  return raw;
}

describe('市场资料合同', () => {
  it('保留零、负数和缺值，强关联证券和请求标识', () => {
    const raw = rawPage();
    const value = correlateMarketReference(input(), raw, 'sample');
    expect(value.items[0]?.values).toMatchObject({
      assets: '0',
      liabilities: '-1.25',
      parentEquity: null,
    });
    expect(() => correlateMarketReference({ ...input(), symbol: '000001.SZ' }, raw)).toThrow();
    expect(() => correlateMarketReference(input(), raw, 'other')).toThrow();
  });
  it.each([
    { upstreamSource: 'eastmoney' },
    { sourceRevision: 'wrong' },
    { historyComplete: true },
    { sourceUrl: 'https://secret@example.com' },
    { status: 'empty' },
    { nextCursor: 'fake' },
    { columns: [...marketReferenceCatalog['financial-balance'].columns].reverse() },
  ])('拒绝来源、版本、列和完整性漂移 %j', (patch) => {
    expect(marketReferenceResultSchema.safeParse({ ...rawPage(), ...patch }).success).toBe(false);
  });
  it.each(['NaN', 'Infinity', '1e99', '00.1', '<script>'])('拒绝无效数字 %s', (number) => {
    const raw = rawPage();
    raw.items[0]!.values.assets = number;
    expect(marketReferenceResultSchema.safeParse(raw).success).toBe(false);
  });
  it.each([
    { dataset: 'holder-count', symbol: '600519.SH', start: '2026-01-01' },
    { dataset: 'valuation-history', symbol: '600519.SH' },
    { dataset: 'global-news', page: 2 },
    { dataset: 'macro-calendar', start: '2026-11-01', end: '2026-11-09' },
    { dataset: 'index-members', indexCode: '399006' },
    { dataset: 'financial-balance', symbol: '510300.SH' },
    { dataset: 'financial-balance', symbol: '600519.SH', url: 'https://example.com/' },
  ])('拒绝不受支持的范围 %j', (raw) => {
    expect(marketReferenceInputSchema.safeParse(raw).success).toBe(false);
  });
  it('中文选项与类型目录共用标签', () => {
    expect(marketReferenceOptions).toHaveLength(63);
    for (const item of marketReferenceOptions)
      expect(item.label).toBe(marketReferenceCatalog[item.value].label);
    expect(
      marketReferenceInputSchema.safeParse({ dataset: 'etf-ticks', symbol: '510300.SH' }).success,
    ).toBe(true);
  });
});
