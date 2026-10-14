// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { backtestExecutionModelSchemaV3 } from '@thesis-ledger/schemas';
import { BacktestModelConfiguration } from '../src/features/strategy/BacktestModelConfiguration.js';
import { BacktestResearchLotSizeDisclosure } from '../src/features/strategy/BacktestResearchLotSizeDisclosure.js';
import { applyResearchLotSize } from '../src/features/strategy/backtest-research-lot-size.model.js';
import { executionResearchDiagnostics } from '../src/features/strategy/backtest-execution-research-diagnostics.model.js';
import { sanitizeBacktestDiagnosticText } from '../src/features/strategy/strategy-backtest-diagnostics.model.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function model() {
  const value = JSON.parse(readFileSync(resolve(process.cwd(), '../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json'), 'utf8').replaceAll('CNY', 'HKD'));
  value.scope = { ...value.scope, symbol: '00147.HK', market: 'HK', timezone: 'Asia/Hong_Kong' };
  value.segments[0].execution.calendarMarket = 'HK'; value.segments[0].execution.price = { kind: 'noDailyLimit', reason: '港股日线研究' };
  value.researchLotSize = { sharesPerLot: '5000', defaultSharesPerLot: '5000', origin: 'providerCurrent', historicalChanges: 'unverified',
    source: { provider: 'webull-current-quote', sourceUrl: 'https://www.webull.hk/quote/hkg-00147', sha256: 'a'.repeat(64), observedAt: '2026-10-08T08:57:12.937458Z' } };
  return backtestExecutionModelSchemaV3.parse(value);
}
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; });
describe('每手研究预设编辑与冻结消费', () => {
  it('覆盖保留来源默认、原模型与费用，非法股数拒绝', () => {
    const original = model(), copy = JSON.stringify(original);
    const next = applyResearchLotSize(original, '1000', '2026-10-08T09:00:00Z');
    expect(next.researchLotSize).toMatchObject({ sharesPerLot: '1000', defaultSharesPerLot: '5000', origin: 'userOverride', historicalChanges: 'unverified' });
    expect(next.segments[0]!.fees).toEqual(original.segments[0]!.fees); expect(JSON.stringify(original)).toBe(copy);
    expect(() => applyResearchLotSize(original, '0')).toThrow(); expect(() => applyResearchLotSize(original, '1.5')).toThrow();
  });
  it('结果说明采用值与默认值，诊断仅导出冻结白名单并脱敏', () => {
    const next = applyResearchLotSize(model(), '1000');
    const html = renderToStaticMarkup(<BacktestResearchLotSizeDisclosure model={next} />);
    expect(html).toContain('采用1000股/手'); expect(html).toContain('来源默认5000股/手');
    expect(html).toContain('手动覆盖'); expect(html).toContain('未核验历史变更');
    expect(executionResearchDiagnostics(next, sanitizeBacktestDiagnosticText).researchLotSize).toEqual(next.researchLotSize);
    next.researchLotSize!.source.sourceUrl = 'https://example.com/?token=private';
    expect(JSON.stringify(executionResearchDiagnostics(next, sanitizeBacktestDiagnosticText))).not.toContain('private');
    const legacy = model(); delete legacy.researchLotSize;
    expect(executionResearchDiagnostics(legacy, sanitizeBacktestDiagnosticText)).toEqual({});
  });
  it('编辑立即使原确认失效，应用并重新确认后消费覆盖值', async () => {
    const host = document.createElement('div'); document.body.append(host);
    let finalShares: string | undefined, invalidations = 0;
    function Probe() {
      const [text, setText] = useState(JSON.stringify(model())), [confirmed, setConfirmed] = useState(true);
      return <BacktestModelConfiguration version={3} text={text} confirmed={confirmed}
        onInvalidate={() => { invalidations++; setConfirmed(false); }} onChange={value => { setText(value); setConfirmed(false); }}
        onConfirm={value => { finalShares = value.researchLotSize?.sharesPerLot; setConfirmed(true); }} />;
    }
    root = createRoot(host); await act(async () => root!.render(<QueryClientProvider client={new QueryClient()}><Probe /></QueryClientProvider>));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="每手股数（研究预设）"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1000'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === text)!;
    expect(invalidations).toBe(1); expect(button('确认以上范围与假设').disabled).toBe(true);
    await act(async () => button('应用每手股数并重新确认').click());
    expect(button('确认以上范围与假设').disabled).toBe(false);
    await act(async () => button('确认以上范围与假设').click()); expect(finalShares).toBe('1000');
  });
});
