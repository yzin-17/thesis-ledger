import { renderToStaticMarkup } from 'react-dom/server';
import { marketReferenceCatalog, type MarketReferenceResult } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { MarketReferenceResult as ReferenceTable } from '../src/features/market-data/MarketReferenceResult.js';

describe('市场资料动态列对齐', () => {
  it('日期靠左，收益率及缺失值均沿用数字列的右对齐', () => {
    const columns = [...marketReferenceCatalog['bond-yields'].columns];
    const result: MarketReferenceResult = {
      dataVersion: 'market-reference-v1',
      requestId: 'alignment-fixture',
      dataset: 'bond-yields',
      symbol: null,
      indexCode: null,
      start: null,
      end: null,
      page: 1,
      pageSize: 5,
      cursor: null,
      nextCursor: null,
      providerId: 'fixture',
      upstreamSource: 'eastmoney',
      adapterRevision: 'market-reference-projection-v1',
      sourceRevision: 'fixture-v1',
      fetchedAt: '2026-11-04T00:00:00.000Z',
      sourceUrl: 'https://example.com/reference',
      columns,
      items: [
        {
          id: 'a'.repeat(64),
          values: Object.fromEntries(
            columns.map((c) => [c.key, c.format === 'date' ? '2026-11-03' : '2.15']),
          ),
        },
        { id: 'b'.repeat(64), values: Object.fromEntries(columns.map((c) => [c.key, null])) },
      ],
      status: 'ok',
      hasMore: false,
      totalSourceRecords: 2,
      historyComplete: false,
      notes: ['本地布局回归样本'],
      contractVersion: 3,
      consumer: 'thesis-ledger',
      policyRevision: 1,
      routeTarget: { providerId: 'fixture', upstreamSource: 'eastmoney', routeIndex: 0 },
    };
    const html = renderToStaticMarkup(<ReferenceTable result={result} />);
    const headers = [...html.matchAll(/<th\b[^>]*>/g)].map((m) => m[0]);
    const cells = [...html.matchAll(/<td\b[^>]*>/g)].map((m) => m[0]);
    expect(headers).toHaveLength(columns.length);
    expect(cells).toHaveLength(columns.length * 2);
    for (let i = 0; i < columns.length; i++) {
      const direction = i === 0 ? 'text-left' : 'text-right';
      expect(headers[i]).toContain(direction);
      expect(cells[i]).toContain(direction);
      expect(cells[i + columns.length]).toContain(direction);
    }
  });
});
