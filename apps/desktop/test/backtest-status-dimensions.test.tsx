import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestTradingStatusDisclosure } from '../src/features/strategy/BacktestTradingStatusDisclosure.js';
import { tradingStatusDiagnosticExport } from '../src/features/strategy/backtest-trading-status-disclosure.model.js';
import { sanitizeBacktestDiagnosticText } from '../src/features/strategy/strategy-backtest-diagnostics.model.js';

const response = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/schemas/fixtures/market-risk-price-limits-v3.response.json',
      import.meta.url,
    ),
    'utf8',
  ),
).response;
describe('独立风险警示与价格限制消费', () => {
  it('显示真实5%/10%、风险变更、未知交易状态和原件时钟', () => {
    const html = renderToStaticMarkup(
      createElement(BacktestTradingStatusDisclosure, {
        disclosure: { status: 'source', response },
      }),
    );
    for (const value of [
      '历史状态与涨跌幅',
      '5%',
      '10%',
      '退市风险警示',
      '其他风险警示',
      '已实施',
      '原始前收盘',
      '未知',
      response.sourceDocuments[0].sha256,
    ])
      expect(html).toContain(value);
    expect(html).toContain('风险警示本身不等同停牌');
  });
  it('未知交易日保留已知规则引用，诊断不丢失维度或精确观察时钟', () => {
    const exported = tradingStatusDiagnosticExport(
      { status: 'source', response },
      sanitizeBacktestDiagnosticText,
    )!;
    if (exported.status !== 'source') throw new Error('source expected');
    expect(exported.days[0]!.state).toBe('unknown');
    expect(exported.days[0]!.sourceDocumentIds).toEqual(response.days[0].sourceDocumentIds);
    expect(exported.days[0]!.dailyPriceLimit!.maxUpRatio).toBe('0.05');
    expect(exported.days[2]!.riskWarning!.delisting).toBe('none');
    expect(exported.sourceDocuments[0]!.observedAt).toBe(response.sourceDocuments[0].observedAt);
  });
});
