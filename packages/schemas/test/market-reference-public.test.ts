import { describe, expect, it } from 'vitest';
import {
  marketReferenceInputSchema,
  marketReferenceResultSchema,
} from '../src/market-reference.js';
import {
  marketReferenceCatalog,
  marketReferenceIndexInfo,
} from '../src/market-reference-catalog.js';
import {
  marketReferenceSourceName,
  marketReferenceSources,
} from '../src/market-reference-sources.js';

describe('公开来源资料合同', () => {
  it.each([
    { dataset: 'repo-fr' },
    { dataset: 'etf-shares-sh', symbol: '510300.SH', start: '2026-11-03', end: '2026-11-03' },
    { dataset: 'etf-shares-sz', symbol: '159915.SZ' },
    { dataset: 'csi-index-weights', indexCode: '000300' },
    { dataset: 'cni-index-members', indexCode: '399001' },
    { dataset: 'szse-company-qna', symbol: '002594.SZ' },
    { dataset: 'ths-eps-consensus', symbol: '600519.SH' },
    { dataset: 'chinabond-curves', start: '2026-11-03', end: '2026-11-03' },
  ])('接受已核对的独立作用域 %j', (value) => {
    expect(marketReferenceInputSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    { dataset: 'etf-shares-sh', symbol: '159915.SZ', start: '2026-11-03', end: '2026-11-03' },
    { dataset: 'etf-shares-sz', symbol: '510300.SH' },
    { dataset: 'cni-index-members', indexCode: '000300' },
    { dataset: 'szse-company-qna', symbol: '600519.SH' },
    { dataset: 'tdx-day-package' },
    { dataset: 'cctv-news', start: '2026-11-02', end: '2026-11-03' },
    { dataset: 'chinabond-curves', start: '2025-01-01', end: '2026-11-03' },
  ])('拒绝其他交易所、指数及不明确窗口 %j', (value) => {
    expect(marketReferenceInputSchema.safeParse(value).success).toBe(false);
  });

  it('指数回显和来源名称采用同一份中文映射', () => {
    expect(marketReferenceIndexInfo('cni-index-weights')).toEqual({
      code: '399001',
      label: '国证深证成指（399001）',
    });
    expect(marketReferenceSourceName('chinamoney-repo-fixing')).toBe('中国货币网');
    expect(marketReferenceSourceName('unrecognized')).toBe('资料来源');
  });

  it('来源 EPS 的元单位不伪造为 CNY，来源修订必须精确匹配', () => {
    const input = marketReferenceInputSchema.parse({
      dataset: 'ths-eps-consensus',
      symbol: '600519.SH',
    });
    const scope = { ...input };
    Reflect.deleteProperty(scope, 'requestBudgetMs');
    const source = marketReferenceSources['ths-eps-consensus'];
    const raw = {
      ...scope,
      ...source,
      dataVersion: 'market-reference-v1',
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: 'sample',
      adapterRevision: 'market-reference-projection-v1',
      sourceUrl: 'https://basic.10jqka.com.cn/600519/worth.html',
      fetchedAt: '2026-11-04T00:00:00Z',
      columns: marketReferenceCatalog['ths-eps-consensus'].columns,
      items: [
        {
          id: 'b'.repeat(64),
          values: { year: '2026', institutions: '3', minimum: '-2', mean: '-1', maximum: '0' },
        },
      ],
      status: 'ok',
      hasMore: false,
      nextCursor: null,
      totalSourceRecords: 1,
      historyComplete: false,
      notes: ['来源未另给 ISO 币种及统计窗，不自行重算。'],
      policyRevision: 182,
      routeTarget: {
        providerId: source.providerId,
        upstreamSource: source.upstreamSource,
        routeIndex: 0,
      },
    };
    expect(marketReferenceResultSchema.safeParse(raw).success).toBe(true);
    expect(raw.columns.find((column) => column.key === 'mean')?.unit).toBe('来源元／股');
    expect(
      marketReferenceResultSchema.safeParse({ ...raw, sourceRevision: 'unknown' }).success,
    ).toBe(false);
  });
});
