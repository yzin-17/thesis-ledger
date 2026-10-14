import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestTradingStatusDisclosure } from '../src/features/strategy/BacktestTradingStatusDisclosure.js';
import { tradingStatusDiagnosticExport } from '../src/features/strategy/backtest-trading-status-disclosure.model.js';

const disclosure = () => {
  const response = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/schemas/fixtures/market-trading-status-v3.response.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).response;
  response.routeTarget = { providerId: 'baostock', upstreamSource: 'baostock', routeIndex: 0 };
  response.provenance = {
    ...response.provenance,
    providerId: 'baostock',
    upstreamSource: 'baostock',
    fetchedAt: '2026-10-09T00:00:00Z',
  };
  response.sourceDocuments = [];
  response.days = response.days.map((day: { date: string }) => {
    if (day.date !== '2023-08-17') return { date: day.date, state: 'unknown' };
    return {
      date: day.date,
      state: 'suspended',
      coarseST: 'flagged',
      sourceRecordIds: ['query-1'],
    };
  });
  response.sourceRecords = [
    {
      id: 'query-1',
      kind: 'normalizedQueryResponse',
      providerId: 'baostock',
      upstreamSource: 'baostock',
      symbol: response.symbol,
      range: response.range,
      queryMethod: 'query_history_k_data_plus+query_trade_dates',
      queryFields: 'date,code,tradestatus,isST',
      normalizerRevision: 'baostock-daily-flags-v1',
      responseSha256: 'a'.repeat(64),
      observedAt: '2026-10-09T00:00:00Z',
    },
  ];
  response.structuredCoverage = {
    expectedSessions: ['2023-08-16', '2023-08-17', '2023-08-18', '2023-08-21'],
    calendarUnknownDates: [],
    statusUnknownDates: ['2023-08-16', '2023-08-18', '2023-08-21'],
    stUnknownDates: ['2023-08-16', '2023-08-18', '2023-08-21'],
    complete: false,
  };
  return {
    status: 'source',
    response,
    structuredResearch: {
      mode: 'fixed-source-status-research-v1',
      priceDataAsOf: '2024-01-01T00:00:00Z',
      frozenAt: '2026-10-09T00:00:00Z',
      observedAfterPriceCutoff: true,
    },
  };
};

describe('结构化状态的页面和实际诊断导出消费', () => {
  it('保留来源、粗 ST、覆盖与实际观察时钟，停牌只表达对应日期', () => {
    const html = renderToStaticMarkup(
      <BacktestTradingStatusDisclosure disclosure={disclosure()} />,
    );
    for (const text of [
      '已使用冻结结构化状态',
      '来源标记停牌',
      'ST 粗标记',
      '交易状态缺失 3',
      '状态实际取得晚于价格截点',
      '规范化查询响应摘要',
      'baostock',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('已使用冻结公告');
    expect(html).not.toContain('公告披露停牌');
  });
  it('基础日期及独立来源引用保留在实际诊断白名单', () => {
    const value = disclosure();
    const basic = { ...value.response.sourceRecords[0], id: 'basic', queryMethod: 'query_stock_basic', queryFields: 'code,ipoDate,outDate,type', normalizerRevision: 'baostock-basic-dates-v1', responseSha256: 'b'.repeat(64) };
    value.response.sourceRecords.push(basic);
    value.response.basicLifecycle = { ipoDate: '2019-01-23', outDate: null, ipoDateStatus: 'known', outDateStatus: 'notProvided', sourceRecordId: 'basic' };
    const exported = tradingStatusDiagnosticExport(value, text => typeof text === 'string' ? text : null);
    expect(exported).toMatchObject({ basicLifecycle: value.response.basicLifecycle, sourceRecords: value.response.sourceRecords });
    expect(renderToStaticMarkup(<BacktestTradingStatusDisclosure disclosure={value} />)).toContain('上市日');
  });
  it('导出逐日原标记、来源引用、覆盖和相同研究假设', () => {
    const value = disclosure();
    const exported = tradingStatusDiagnosticExport(value, (text) =>
      typeof text === 'string' ? text : null,
    )!;
    expect(exported).toMatchObject({
      structuredCoverage: value.response.structuredCoverage,
      structuredResearch: value.structuredResearch,
      sourceRecords: value.response.sourceRecords,
    });
    expect('days' in exported && exported.days[1]).toMatchObject({
      state: 'suspended',
      coarseST: 'flagged',
      sourceRecordIds: ['query-1'],
    });
    const text = JSON.stringify(exported);
    expect(text).not.toContain('routeTarget');
    expect(text).not.toContain('requestId');
  });
});
