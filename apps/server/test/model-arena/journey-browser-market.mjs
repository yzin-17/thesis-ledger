// 浏览器只替换外部来源和已生成的研究摘要。自选、比赛、点位和周报仍使用 Nest HTTP。
import { randomUUID } from 'node:crypto';
import {
  periodViewFixture,
  refreshSourceFingerprint,
} from '../market/market-period-view.fixture.js';

export function browserMarket({ symbol, instrumentId, days }) {
  const [start, end] = days.slice(0, 2).map((d) => d.tradingDate);
  const series = periodViewFixture().source;
  series.identity = { ...series.identity, symbol, assetType: 'STOCK' };
  series.points = days.slice(0, 2).map((d) => ({
    ...series.points[0],
    timestamp: new Date(d.endAt).toISOString(),
    availableAt: new Date(d.endAt).toISOString(),
    open: 10,
    close: 10,
    high: 10,
    low: 10,
  }));
  Object.assign(series.chartContextV3, { requestedStart: start, requestedEnd: end });
  series.coverage.latestCompleteTradingDate = end;
  refreshSourceFingerprint(series);
  const reportId = randomUUID();
  let newsCount = 0;
  return async function marketResponse(route, url) {
    const params = url.searchParams;
    if (url.pathname.endsWith('/chart-options')) {
      const plan = {
        barsLimit: Number(params.get('barsLimit')),
        indicatorParams: JSON.parse(params.get('indicatorParams') || '{}'),
      };
      if (params.has('assetType')) plan.assetType = params.get('assetType');
      if (params.has('planEnd')) plan.end = params.get('planEnd');
      return route.fulfill({
        json: {
          contractVersion: 3,
          mode: 'v3',
          symbol,
          window: { start, end },
          plan,
          options: ['qfq', 'hfq', 'none'].map((adjustment) => ({
            adjustment,
            available: true,
            reason: null,
          })),
        },
      });
    }
    if (url.pathname.endsWith('/detail'))
      return route.fulfill({
        json: {
          contractVersion: 3,
          symbol,
          assetType: 'STOCK',
          identity: { source: 'symbol', status: 'confirmed' },
          requested: ['bars'],
          capabilities: { supported: ['bars'], unsupported: [] },
          limits: { bars: 90, nav: 30 },
          sections: { bars: { capability: 'bars', status: 'ready', data: series } },
          barSeries: series,
          dependencies: {},
          requestId: 'fixture',
          generatedAt: new Date().toISOString(),
        },
      });
    if (url.pathname === '/api/market-data/news') {
      const input = route.request().postDataJSON();
      if (input.instrument.symbol !== symbol) throw Error('标的新闻身份不符');
      ++newsCount;
      if (newsCount === 1) return route.continue();
      if (newsCount === 2) {
        const actual = await route.fetch();
        const json = await actual.json();
        return route.fulfill({
          json: {
            ...json,
            items: [],
            coverage: {
              ...json.coverage,
              examinedCount: 0,
              returnedCount: 0,
              uniqueEvidenceCount: 0,
            },
          },
        });
      }
      return route.fulfill({
        status: 503,
        json: { error: 'source_unavailable', message: '来源中断' },
      });
    }
    if (url.pathname === '/api/market-data/announcements') {
      if (params.get('symbol') !== symbol) throw Error('公告身份不符');
      return route.fulfill({
        json: {
          providerId: 'official-states',
          page: 1,
          pageSize: 10,
          total: 1,
          items: [
            {
              id: 'fixture-release',
              symbol,
              title: '受控公告披露新增订单',
              url: 'https://example.org/fixture',
              publishedDate: params.get('end'),
              uses: [],
              downloadState: 'downloaded',
              parseState: 'parsed',
            },
          ],
        },
      });
    }
    if (
      url.pathname === '/api/v1/research/reports' &&
      params.get('instrumentId') === instrumentId
    ) {
      const now = new Date().toISOString();
      const historicalScope = {
        status: 'known',
        snapshot: {
          version: 'research-scope-v2',
          mode: 'actual',
          confirmedAt: now,
          scope: 'instrument',
          instrument: {
            symbol,
            market: 'CN',
            assetType: 'STOCK',
            instrumentId,
            currency: 'CNY',
            catalogGeneration: 1,
          },
        },
      };
      return route.fulfill({
        json: {
          items: [
            {
              id: reportId,
              status: 'completed',
              question: '订单怎样影响收入？',
              summary: '受控研究摘要',
              errorCode: null,
              errorSummary: null,
              createdAt: now,
              updatedAt: now,
              historicalScope,
              resultVersion: 2,
              availability: 'available',
              quality: null,
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      });
    }
    return route.fulfill({ status: 404, json: { message: '隔离环境未配置该来源' } });
  };
}
