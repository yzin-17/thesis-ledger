import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestTradingStatusDisclosure } from '../src/features/strategy/BacktestTradingStatusDisclosure.js';
import { BacktestPublicFeesDisclosure } from '../src/features/strategy/BacktestPublicFeesDisclosure.js';
import { tradingStatusDiagnosticExport } from '../src/features/strategy/backtest-trading-status-disclosure.model.js';
import { publicFeesDiagnosticExport } from '../src/features/strategy/backtest-public-fees-diagnostic.js';
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../packages/schemas/fixtures/market-${name}-v3.response.json`, import.meta.url), 'utf8')).response;
const sanitize = (value: unknown) => typeof value === 'string' ? value : null;

describe('港美股来源与日线解释消费', () => {
  it.each(['hk', 'us'])('%s页面及诊断保留实际时刻、未知与来源限定', (market) => {
    const response = fixture(`${market}-status`);
    const value = { status: 'source', response, executionInterpretation: {
      policy: 'exclude-known-halt-date-v1', excludedDates: [response.days.find((day: { intradayHalts?: unknown }) => day.intradayHalts).date],
      reason: '明确保守日线排除模型' } };
    const html = renderToStaticMarkup(<BacktestTradingStatusDisclosure disclosure={value} />);
    expect(html).toContain('盘中暂停'); expect(html).toContain('未知');
    expect(html).toContain(response.provenance.timezone);
    if (market === 'us') expect(html).toContain('发布日期未知');
    const exported = tradingStatusDiagnosticExport(value, sanitize)!;
    expect(exported).toHaveProperty('executionInterpretation', value.executionInterpretation);
    if ('days' in exported) expect(exported.days.find((day) => day.intradayHalts)?.intradayHalts).toEqual(
      response.days.find((day: { intradayHalts?: unknown }) => day.intradayHalts).intradayHalts);
  });
  it('美股费用页面和导出保留结算日期口径，未纳入TAF与完整原件摘要', () => {
    const response = fixture('us-fees'), value = { status: 'source', response };
    const html = renderToStaticMarkup(<BacktestPublicFeesDisclosure disclosure={value} />);
    expect(html).toContain('T+2'); expect(html).toContain('TAF'); expect(html).toContain('原件摘要');
    const exported = publicFeesDiagnosticExport(value, sanitize)!;
    expect(exported).toHaveProperty('segments', response.segments);
    expect(exported).toHaveProperty('provenance.chargeDatePolicy', response.provenance.chargeDatePolicy);
  });
});
