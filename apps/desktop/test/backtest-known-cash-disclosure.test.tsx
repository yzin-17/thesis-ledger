import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtestKnownCashDisclosureV3Schema } from '@thesis-ledger/schemas';
import { BacktestKnownCashDividendDisclosure } from '../src/features/strategy/BacktestKnownCashDividendDisclosure.js';
import { BacktestKnownCashResearchChoice } from '../src/features/strategy/BacktestKnownCashResearchChoice.js';
import { knownCashDiagnosticExport } from '../src/features/strategy/backtest-known-cash-disclosure.model.js';
import {
  sanitizeBacktestDiagnosticText,
  buildBacktestDiagnosticExport,
} from '../src/features/strategy/strategy-backtest-diagnostics.model.js';

const exchange = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/schemas/fixtures/market-known-cash-v3.exchange.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const disclosure = backtestKnownCashDisclosureV3Schema.parse({
  version: 'known-cash-dividend-disclosure-v1',
  preparationHash: 'a'.repeat(64),
  policy: exchange.request.researchPolicy,
  scope: {
    symbol: exchange.request.symbol,
    market: 'CN',
    instrumentType: 'ETF',
    currency: 'CNY',
    startDate: exchange.request.start,
    endDate: exchange.request.end,
    dataAsOf: exchange.request.dataAsOf,
  },
  source: exchange.response.source,
  coverage: exchange.response.coverage,
  ignoredEmptyRows: 0,
  revisions: { desiredRevision: 1, effectivePolicyRevision: 1, catalogRevision: 1 },
  records: exchange.response.records.map((record: Record<string, unknown>) => ({
    ...record,
    eligibleQuantity: '100',
    grossCashAmount: '8.8',
    status: 'simulated-paid',
  })),
});
describe('已知方案的显式选择/页面与诊断', () => {
  it('来源缺公告日和状态分别显示并按null导出，模拟现金不冒充实际支付', () => {
    const value = structuredClone(disclosure);
    Object.assign(value.records[0]!, {
      announcementDate: null,
      sourcePlanStatus: null,
      sourceStatus: null,
      normalizedStatus: 'unknown',
      planStatus: 'unknown',
      statusBasis: 'unverified',
      issues: ['MISSING_ANNOUNCEMENT_DATE', 'MISSING_DIVIDEND_STATUS'],
    });
    const html = renderToStaticMarkup(
      createElement(BacktestKnownCashDividendDisclosure, { disclosure: value }),
    );
    expect(html).toContain('公告日 来源未提供');
    expect(html).toContain('标准状态未知');
    expect(
      knownCashDiagnosticExport(value, sanitizeBacktestDiagnosticText)!.records[0]!
        .announcementDate,
    ).toBeNull();
  });
  it('选择控件列明全部假设；来源未知覆盖、原单位、税前资格与模拟状态一致显示', () => {
    const choice = renderToStaticMarkup(
      createElement(BacktestKnownCashResearchChoice, {
        selected: true,
        onChange: () => {},
        assumeUnknown: false,
        onAssumeUnknown: () => {},
      }),
    );
    for (const text of [
      '要求完整事件覆盖',
      '按来源记录研究',
      '仅采用明确或已核对记录',
      '假设采用未知状态记录',
      '成交持有份额',
      '税前',
      '遗漏事件',
      '未采用',
      '历史首次可见',
    ])
      expect(choice).toContain(text);
    const html = renderToStaticMarkup(
      createElement(BacktestKnownCashDividendDisclosure, { disclosure }),
    );
    for (const text of [
      '覆盖未知',
      '零条不证明零分红',
      '模拟发放',
      '元/10份',
      '登记资格',
      '税前现金',
      '8.8',
      disclosure.source.responseSha256,
    ])
      expect(html).toContain(text);
    expect(
      renderToStaticMarkup(
        createElement(BacktestKnownCashDividendDisclosure, { disclosure: undefined }),
      ),
    ).toBe('');
  });
  it('导出同一资料/假设/控制版本/金额，非法扩展拒绝并脱敏文本', () => {
    const exported = knownCashDiagnosticExport(disclosure, sanitizeBacktestDiagnosticText)!;
    expect(exported.policy).toEqual(disclosure.policy);
    expect(exported.source.controlIdentity).toEqual(disclosure.source.controlIdentity);
    expect(exported.records[0]!.grossCashAmount).toBe('8.8');
    const diagnostics = buildBacktestDiagnosticExport(
      { id: 'job', strategyVersionId: 'strategy', status: 'succeeded' },
      { schemaVersion: '3', knownCashDividendDisclosure: disclosure },
    );
    expect(diagnostics.outcome.knownCashDividends).toEqual(exported);
    expect(
      knownCashDiagnosticExport({ ...disclosure, secret: 'bad' }, sanitizeBacktestDiagnosticText),
    ).toBeUndefined();
    const wrongAmount = structuredClone(disclosure);
    wrongAmount.records[0]!.grossCashAmount = '888';
    expect(knownCashDiagnosticExport(wrongAmount, sanitizeBacktestDiagnosticText)).toBeUndefined();
    const wrongIdentity = structuredClone(disclosure);
    wrongIdentity.source.queryIdentity.requestedSymbol = '510050.SH';
    expect(
      knownCashDiagnosticExport(wrongIdentity, sanitizeBacktestDiagnosticText),
    ).toBeUndefined();
    const unsafe = structuredClone(disclosure);
    unsafe.source.queryIdentity.queryIdentifier = 'https://example.test/?api_key=must-not-export';
    expect(
      JSON.stringify(knownCashDiagnosticExport(unsafe, sanitizeBacktestDiagnosticText)),
    ).not.toContain('must-not-export');
  });
});
