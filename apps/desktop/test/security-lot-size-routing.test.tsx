// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { backtestExecutionModelSchemaV3, type BacktestExecutionModelV3 } from '@thesis-ledger/schemas';
import { BacktestResearchLotSizeEditor } from '../src/features/strategy/BacktestResearchLotSizeEditor.js';
import { fetchSecurityLotSize } from '../src/features/strategy/security-lot-size.api.js';
import { applyResearchLotSize } from '../src/features/strategy/backtest-research-lot-size.model.js';
import { researchLotSizeDiagnostic } from '../src/features/strategy/backtest-research-lot-size-diagnostic.js';
import { marketCapabilityLabel } from '../src/features/market-data/market-data-routes-v3.js';
import { credentialFieldLabels } from '../src/features/market-data/provider-credentials.js';

vi.mock('../src/features/strategy/security-lot-size.api.js', () => ({ fetchSecurityLotSize: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const reference = { symbol: '00147.HK', sharesPerLot: '1000', historicalChanges: 'unverified' as const,
  source: { provider: 'futu', sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
    sha256: 'b'.repeat(64), observedAt: '2026-10-08T10:00:00Z' } };
const response = { ...reference, contractVersion: 3 as const, consumer: 'thesis-ledger' as const, requestId: 'lookup',
  fetchedAt: '2026-10-08T10:01:00Z', policyRevision: 2,
  routeTarget: { providerId: 'futu' as const, upstreamSource: 'futu' as const, routeIndex: 0 } };
function model() {
  const value = JSON.parse(readFileSync(resolve(process.cwd(), '../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json'), 'utf8').replaceAll('CNY', 'HKD'));
  value.scope = { ...value.scope, symbol: '00147.HK', market: 'HK', timezone: 'Asia/Hong_Kong' };
  value.segments[0].execution.calendarMarket = 'HK';
  value.segments[0].execution.price = { kind: 'noDailyLimit', reason: '港股日线研究' };
  value.researchLotSize = { sharesPerLot: '5000', defaultSharesPerLot: '5000', origin: 'providerCurrent',
    historicalChanges: 'unverified', source: { ...reference.source, provider: 'webull-current-quote' } };
  return backtestExecutionModelSchemaV3.parse(value);
}
let root: Root | undefined;
let client: QueryClient;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; client?.clear(); document.body.innerHTML = ''; vi.clearAllMocks(); });
async function render(value = model()) {
  const host = document.createElement('div'); document.body.append(host);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onChange = vi.fn(), onDraftChange = vi.fn();
  root = createRoot(host);
  await act(async () => root!.render(<QueryClientProvider client={client}>
    <BacktestResearchLotSizeEditor model={value} onChange={onChange} onDraftChange={onDraftChange} />
  </QueryClientProvider>));
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!;
  const lookup = async () => act(async () => { button('按路由查询当前每手股数').click(); await new Promise(done => setTimeout(done, 20)); });
  return { host, button, lookup, onChange, onDraftChange };
}

it('独立路由有中文能力和 OpenD 连接字段', () => {
  expect(marketCapabilityLabel('SECURITY_LOT_SIZE')).toBe('每手股数');
  expect(credentialFieldLabels.host).toBe('OpenD 主机地址');
  expect(credentialFieldLabels.port).toBe('OpenD 端口');
});
it('查询只改草稿；手动覆盖后应用，保留原模型和独立参考', async () => {
  vi.mocked(fetchSecurityLotSize).mockResolvedValue(response);
  const original = model(), copy = JSON.stringify(original);
  const { host, button, lookup, onChange, onDraftChange } = await render(original);
  await lookup(); expect(onChange).not.toHaveBeenCalled(); expect(onDraftChange).toHaveBeenCalledOnce();
  const input = host.querySelector<HTMLInputElement>('input')!;
  expect(input.value).toBe('1000'); expect(host.textContent).toContain('富途 OpenAPI');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '500'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('应用每手股数并重新确认').click());
  const applied = JSON.parse(onChange.mock.calls[0]![0]) as BacktestExecutionModelV3;
  expect(applied.researchLotSize).toMatchObject({ sharesPerLot: '500', defaultSharesPerLot: '1000', origin: 'userOverride', source: { provider: 'futu', symbol: '00147.HK' } });
  expect(researchLotSizeDiagnostic(applied)?.source.symbol).toBe('00147.HK');
  expect(JSON.stringify(original)).toBe(copy);
});
it('没有旧静态预设时可通过独立查询创建，不复制 00147 固定值', async () => {
  const original = model(); delete original.researchLotSize;
  vi.mocked(fetchSecurityLotSize).mockResolvedValue(response);
  const { button, lookup, onChange } = await render(original);
  expect(button('应用每手股数并重新确认').disabled).toBe(true);
  await lookup(); await act(async () => button('应用每手股数并重新确认').click());
  expect(JSON.parse(onChange.mock.calls[0]![0]).researchLotSize.defaultSharesPerLot).toBe('1000');
});
it('查询失败保留原预设，不编造默认值', async () => {
  vi.mocked(fetchSecurityLotSize).mockRejectedValue(new Error('no eligible provider'));
  const { host, button, lookup, onChange } = await render();
  await lookup(); expect(host.textContent).toContain('查询失败');
  expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('5000');
  await act(async () => button('应用每手股数并重新确认').click());
  expect(JSON.parse(onChange.mock.calls[0]![0]).researchLotSize.defaultSharesPerLot).toBe('5000');
});
it('查询中禁用编辑，切换模型或卸载时取消，不应用晚到数据', async () => {
  let done!: (value: typeof response) => void;
  vi.mocked(fetchSecurityLotSize).mockReturnValue(new Promise(resolve => { done = resolve; }));
  const { host, button, onChange } = await render();
  await act(async () => { button('按路由查询当前每手股数').click(); await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
  const signal = vi.mocked(fetchSecurityLotSize).mock.calls[0]![1]!;
  await act(async () => root!.unmount()); root = undefined;
  expect(signal.aborted).toBe(true);
  await act(async () => done(response)); expect(onChange).not.toHaveBeenCalled();
});
it('拒绝把其他标的的参考应用到当前模型', () => {
  expect(() => applyResearchLotSize(model(), '1000', undefined, { ...reference, symbol: '00700.HK' })).toThrow('标的');
});
