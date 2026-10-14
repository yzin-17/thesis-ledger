// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { backtestExecutionModelSchemaV3 } from '@thesis-ledger/schemas';
import { BacktestModelConfiguration } from '../src/features/strategy/BacktestModelConfiguration.js';
import { BacktestBrokerCommissionDisclosure } from '../src/features/strategy/BacktestBrokerCommissionDisclosure.js';
import { applyBrokerCommission, defaultBrokerCommission } from '../src/features/strategy/backtest-broker-commission.model.js';
import { brokerCommissionDiagnostic } from '../src/features/strategy/backtest-broker-commission-diagnostic.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fixture = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), '../../packages/schemas/fixtures', name), 'utf8'));
function model(market: 'HK' | 'US' = 'HK') {
  const value = fixture('backtest-execution-model.cn-2024q1.json'), currency = market === 'HK' ? 'HKD' : 'USD';
  value.scope = { ...value.scope, market, currency };
  for (const segment of value.segments) {
    segment.execution.calendarMarket = market; segment.fees.currency = currency;
    for (const charge of Object.values(segment.fees) as { treatment?: string; currency?: string }[])
      if (charge?.treatment === 'charged') charge.currency = currency;
    for (const key of ['handlingFee', 'regulatoryFee'])
      segment.fees[key] = { treatment: 'notApplicable', reason: '受控隔离券商测试，未纳入此公共费项' };
  }
  return backtestExecutionModelSchemaV3.parse(value);
}
let root: Root | undefined;
let client: QueryClient | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); client?.clear(); client = undefined; root = undefined; document.body.innerHTML = ''; });
describe('券商默认值、编辑及冻结披露', () => {
  it('默认费率来自已核对套餐，应用时保留公共费项和原模型', () => {
    expect(defaultBrokerCommission('HK')).toEqual(fixture('backtest-broker-commission.futu.json').HK);
    expect(defaultBrokerCommission('US')).toEqual(fixture('backtest-broker-commission.futu.json').US);
    const original = model(), copy = JSON.stringify(original);
    const applied = applyBrokerCommission(original, defaultBrokerCommission('HK'));
    expect(applied.segments[0]!.fees!.stampDuty).toEqual(original.segments[0]!.fees!.stampDuty);
    expect(applied.segments[0]!.fees!.commission.rate).toBe('0');
    expect(JSON.stringify(original)).toBe(copy);
  });
  it('美股换算假设、用户修改和精确配置进入结果及诊断', () => {
    const profile = defaultBrokerCommission('US'); profile.basis = { kind: 'referencePrice', price: '13.75' }; profile.userModified = true;
    const applied = applyBrokerCommission(model('US'), profile);
    const html = renderToStaticMarkup(<BacktestBrokerCommissionDisclosure model={applied} />);
    expect(html).toContain('13.75'); expect(html).toContain('用户已调整'); expect(html).toContain('研究假设');
    expect(brokerCommissionDiagnostic(applied)[0]!.configuration).toEqual(profile);
    expect(brokerCommissionDiagnostic(model())).toEqual([]);
  });
  it('编辑使确认失效；应用后再次确认得到用户值和零旧佣金', async () => {
    const host = document.createElement('div'); document.body.append(host);
    let finalRate: string | undefined;
    function Probe() {
      const [text, setText] = useState(JSON.stringify(applyBrokerCommission(model(), defaultBrokerCommission('HK'))));
      const [confirmed, setConfirmed] = useState(true);
      return <BacktestModelConfiguration version={3} text={text} confirmed={confirmed}
        onInvalidate={() => setConfirmed(false)} onChange={(value) => { setText(value); setConfirmed(false); }}
        onConfirm={(value) => { finalRate = value.segments[0]!.fees!.brokerCommission!.commission.rate; setConfirmed(true); }} />;
    }
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    root = createRoot(host); await act(async () => root!.render(<QueryClientProvider client={client!}><Probe /></QueryClientProvider>));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="佣金比例（小数，0.0003为0.03%）"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0.0002'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    const confirmation = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '确认以上范围与假设')!;
    expect(confirmation().disabled).toBe(true);
    const apply = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '应用券商成本并重新确认')!;
    await act(async () => apply.click()); expect(confirmation().disabled).toBe(false);
    await act(async () => confirmation().click()); expect(finalRate).toBe('0.0002');
  });
});
