// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import type { SecurityLotSizeResponse } from '@thesis-ledger/schemas';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExecutionRuleReference } from '../src/features/account-data/ExecutionRuleReference.js';

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => api }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let client: QueryClient;

function reference(symbol = '00700.HK', ageMs = 1000): SecurityLotSizeResponse {
  return {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'reference-test',
    symbol,
    sharesPerLot: '100',
    historicalChanges: 'unverified',
    fetchedAt: new Date(Date.now() - 500).toISOString(),
    policyRevision: 1,
    source: {
      symbol,
      provider: 'futu',
      sourceUrl: 'https://openapi.futunn.com/futu-api-doc/quote/get-static-info.html',
      sha256: 'a'.repeat(64),
      observedAt: new Date(Date.now() - ageMs).toISOString(),
    },
    routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
  };
}

beforeEach(() => {
  api.request.mockReset();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  client?.clear();
  document.body.innerHTML = '';
});
async function render(symbol: string) {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <ExecutionRuleReference symbol={symbol} />
      </QueryClientProvider>,
    ),
  );
}
async function query() {
  const button = document.querySelector<HTMLButtonElement>('button')!;
  await act(async () => button.click());
}
async function waitFor(text: string) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(document.body.textContent).toContain(text);
  });
}

it.each(['', '000001.SZ', 'AAPL.US', '161725.OF'])(
  '未选择或未覆盖的 %s 不请求、不补默认每手',
  async (symbol) => {
    await render(symbol);
    expect(document.body.textContent).toContain('交易规则未验证');
    expect(document.body.textContent).toContain(symbol ? '暂无已核对的规则参考' : '选择标的后');
    expect(document.querySelector('button')).toBeNull();
    expect(api.request).not.toHaveBeenCalled();
  },
);

it('上海标的显示已核对的官方文件、版本和日期，公开资料不冒充成交适用性验证', async () => {
  await render('510300.SH');
  expect(document.body.textContent).toContain('上交所交易规则（2026年修订）');
  expect(document.body.textContent).toContain('上证发〔2026〕41号');
  expect([...document.querySelectorAll('time')].map((node) => node.dateTime)).toEqual([
    '2026-04-24',
    '2026-10-21',
  ]);
  expect(document.querySelector('a')?.href).toBe(
    'https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml',
  );
  expect(document.body.textContent).toContain('基金分类页时效标记有差异');
  expect(document.body.textContent).toContain('完整适用性未验证');
  expect(document.body.textContent).toContain('每手参考不限制成交数量或均价');
  expect(api.request).not.toHaveBeenCalled();
});

it('切换市场时不沿用上海文档或补造其他市场来源', async () => {
  await render('510300.SH');
  await render('000001.SZ');
  expect(document.body.textContent).toContain('暂无已核对的规则参考');
  expect(document.querySelector('a')).toBeNull();
  expect(api.request).not.toHaveBeenCalled();
});

it('主动查询后显示当前标的、来源与两个时间，保留历史未验证及非阻断说明', async () => {
  const value = reference();
  api.request.mockResolvedValue(value);
  await render('00700.HK');
  expect(api.request).not.toHaveBeenCalled();
  await query();
  await waitFor('当前每手 100 股');
  expect(api.request).toHaveBeenCalledOnce();
  expect(api.request).toHaveBeenCalledWith('/api/market-data/security-lot-size?symbol=00700.HK', {
    signal: expect.any(AbortSignal),
  });
  expect(document.body.textContent).toContain('00700.HK');
  expect(document.body.textContent).toContain('历史变更及成交日期适用性未验证');
  expect(document.body.textContent).toContain('每手参考不限制成交数量或均价');
  expect(document.body.textContent).not.toContain('参考陈旧');
  const source = document.querySelector('a')!;
  expect(source.textContent).toBe('富途 OpenAPI');
  expect(source.href).toBe(value.source.sourceUrl);
  expect([...document.querySelectorAll('time')].map((node) => node.dateTime)).toEqual([
    value.source.observedAt,
    value.fetchedAt,
  ]);
  expect(document.querySelector('button')?.type).toBe('button');
});

it('陈旧参考保留来源和时点，提示超过 24 小时', async () => {
  api.request.mockResolvedValue(reference('00700.HK', 25 * 60 * 60 * 1000));
  await render('00700.HK');
  await query();
  await waitFor('参考陈旧');
  expect(document.body.textContent).toContain('当前每手 100 股');
  expect(document.body.textContent).toContain('超过 24 小时');
  expect(document.querySelector('a')).not.toBeNull();
});

it.each([
  ['timeout', '查询超时'],
  ['unavailable', '检查来源配置与连接'],
  ['invalid-response', '参考内容或标的不一致'],
  ['unsupported-capability', '不支持这项每手参考'],
  ['unauthorized', '尚无可用的每手参考读取权限'],
])('失败 %s 明确降级，不泄露原始错误、不自动重试', async (error, message) => {
  api.request.mockRejectedValue(
    new ThesisLedgerApiError(503, { error, message: 'upstream-internal' }),
  );
  await render('00700.HK');
  await query();
  await waitFor(message);
  expect(document.body.textContent).toContain('仍可继续录入成交');
  expect(document.body.textContent).not.toContain('upstream-internal');
  expect(api.request).toHaveBeenCalledOnce();
  expect(document.querySelector('button')?.disabled).toBe(false);
});

it.each(['other-symbol', 'source-conflict', 'future-observation', 'future-fetch'])(
  '拒绝不可确认的参考 %s',
  async (scenario) => {
    const value = reference();
    if (scenario === 'other-symbol') value.symbol = '00941.HK';
    if (scenario === 'source-conflict') value.source.provider = 'longbridge';
    if (scenario === 'future-observation') {
      value.source.observedAt = new Date(Date.now() + 60000).toISOString();
      value.fetchedAt = new Date(Date.now() + 61000).toISOString();
    }
    if (scenario === 'future-fetch') value.fetchedAt = new Date(Date.now() + 60000).toISOString();
    api.request.mockResolvedValue(value);
    await render('00700.HK');
    await query();
    await waitFor(scenario.startsWith('future-') ? '参考时间异常' : '参考内容或标的不一致');
    expect(document.body.textContent).not.toContain('当前每手 100 股');
    expect(document.querySelector('a')).toBeNull();
  },
);

it('切换标的时取消请求，忽略晚到结果，新标的仍需主动查询', async () => {
  let finish!: (value: SecurityLotSizeResponse) => void;
  api.request.mockReturnValueOnce(
    new Promise<SecurityLotSizeResponse>((resolve) => {
      finish = resolve;
    }),
  );
  await render('00700.HK');
  await query();
  await waitFor('参考查询中');
  const signal = api.request.mock.calls[0]![1].signal as AbortSignal;
  await render('00941.HK');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(reference()));
  expect(document.body.textContent).not.toContain('00700.HK');
  expect(document.body.textContent).toContain('参考尚未查询');
  expect(api.request).toHaveBeenCalledOnce();
  api.request.mockResolvedValueOnce(reference('00941.HK'));
  await query();
  await waitFor('00941.HK：当前每手 100 股');
});

it('刷新失败后不把旧成功结果继续显示为本次参考', async () => {
  api.request.mockResolvedValueOnce(reference());
  await render('00700.HK');
  await query();
  await waitFor('当前每手 100 股');
  api.request.mockRejectedValueOnce(new Error('network failure'));
  await query();
  await waitFor('每手参考暂不可用');
  expect(document.body.textContent).not.toContain('当前每手 100 股');
  expect(document.querySelector('a')).toBeNull();
});
