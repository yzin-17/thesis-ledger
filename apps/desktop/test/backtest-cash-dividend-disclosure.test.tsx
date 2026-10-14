import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtestCashDividendDisclosureV3Schema } from '@thesis-ledger/schemas';
import { BacktestCashDividendDisclosure } from '../src/features/strategy/BacktestCashDividendDisclosure.js';
import { cashDividendDiagnosticExport } from '../src/features/strategy/backtest-cash-dividend-disclosure.model.js';
import { sanitizeBacktestDiagnosticText } from '../src/features/strategy/strategy-backtest-diagnostics.model.js';

const pack = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/schemas/fixtures/market-notice-dividend-pack-v3.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const disclosure = backtestCashDividendDisclosureV3Schema.parse({
  model: 'ex-date-entitlement-payment-date-cash-v1',
  splitEvents: 'not-modelled',
  historicalAvailability: 'notVerified',
  records: [
    {
      symbol: '510300.SH',
      effectiveDate: '2023-01-16',
      recordDate: '2023-01-13',
      paymentDate: '2023-01-19',
      amountPerFundUnit: '0.064',
      currency: 'CNY',
      eligibleQuantity: '100',
      grossCashAmount: '6.4',
      status: 'paid',
      provider: 'official-dividends',
      providerRevision: 'source-sha256',
      observedAt: '2026-10-06T18:31:16.730840Z',
      sourceDocuments: pack.sourceDocuments.map(
        ({ id, title, url, sha256, publishedDate, observedAt }: Record<string, string>) => ({
          id,
          title,
          url,
          sha256,
          publishedDate,
          observedAt,
        }),
      ),
    },
  ],
});
describe('现金事件页面与诊断白名单', () => {
  it('展示每份单位、资格、金额、三个日期和真实原件链接，旧结果不显示', () => {
    const html = renderToStaticMarkup(
      createElement(BacktestCashDividendDisclosure, { disclosure }),
    );
    for (const text of [
      '510300.SH',
      '每份 0.064 元',
      '已发放',
      '100',
      '6.4',
      '登记日',
      '除息日',
      '发放日',
      pack.sourceDocuments[0].url,
      pack.sourceDocuments[0].sha256,
    ])
      expect(html).toContain(text);
    expect(
      renderToStaticMarkup(
        createElement(BacktestCashDividendDisclosure, { disclosure: undefined }),
      ),
    ).toBe('');
  });
  it('诊断保留精确金额与来源时钟；无效披露、未知扩展和凭证不进入导出', () => {
    const clean = cashDividendDiagnosticExport(disclosure, sanitizeBacktestDiagnosticText)!;
    expect(clean.records[0]?.grossCashAmount).toBe('6.4');
    expect(clean.records[0]?.observedAt).toBe('2026-10-06T18:31:16.730840Z');
    expect(
      cashDividendDiagnosticExport(
        { ...disclosure, rawContent: 'secret' },
        sanitizeBacktestDiagnosticText,
      ),
    ).toBeUndefined();
    const bad = structuredClone(disclosure);
    bad.records[0]!.status = 'unavailable';
    expect(cashDividendDiagnosticExport(bad, sanitizeBacktestDiagnosticText)).toBeUndefined();
    const unsafe = structuredClone(disclosure);
    unsafe.records[0]!.sourceDocuments[0]!.url += '?api_key=must-not-export';
    expect(
      JSON.stringify(cashDividendDiagnosticExport(unsafe, sanitizeBacktestDiagnosticText)),
    ).not.toContain('must-not-export');
  });
});
