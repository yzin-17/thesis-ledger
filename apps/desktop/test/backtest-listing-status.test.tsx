import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestTradingStatusDisclosure } from '../src/features/strategy/BacktestTradingStatusDisclosure.js';
import { tradingStatusDiagnosticExport } from '../src/features/strategy/backtest-trading-status-disclosure.model.js';
import { sanitizeBacktestDiagnosticText } from '../src/features/strategy/strategy-backtest-diagnostics.model.js';

function response() {
  const raw = JSON.parse(readFileSync(new URL('../../../packages/schemas/fixtures/market-risk-price-limits-v3.response.json', import.meta.url), 'utf8')).response;
  delete raw.days[0].dailyPriceLimit;
  raw.days[0].listingPhase = 'initialListing';
  raw.days[0].noDailyPriceLimit = { reason: '上市首五个交易日' };
  raw.days[1].listingPhase = 'delistingPeriod';
  raw.days[2].listingPhase = 'delisted';
  raw.days[2].state = 'unknown';
  return raw;
}

describe('上市阶段与来源无日限制消费', () => {
  it('中文显示阶段、无日限制和摘牌执行边界，保留未知全天状态', () => {
    const html = renderToStaticMarkup(createElement(BacktestTradingStatusDisclosure,
      { disclosure: { status: 'source', response: response() } }));
    for (const value of ['上市初期', '退市整理期', '已摘牌', '不设日涨跌幅限制', '未知', '末次价格不代表摘牌后可变现价值'])
      expect(html).toContain(value);
    expect(html).not.toContain('initialListing');
  });
  it('诊断保留阶段、无日限制原因、来源摘要与原时钟', () => {
    const raw = response();
    const exported = tradingStatusDiagnosticExport({ status: 'source', response: raw }, sanitizeBacktestDiagnosticText)!;
    if (exported.status !== 'source') throw new Error('source expected');
    expect(exported.days[0]!.listingPhase).toBe('initialListing');
    expect(exported.days[0]!.noDailyPriceLimit).toEqual(raw.days[0].noDailyPriceLimit);
    expect(exported.days[2]!.state).toBe(raw.days[2].state);
    expect(exported.sourceDocuments[0]!.sha256).toBe(raw.sourceDocuments[0].sha256);
    expect(exported.sourceDocuments[0]!.observedAt).toBe(raw.sourceDocuments[0].observedAt);
  });
});
