import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FundDailyComparison } from '../src/features/market-detail/FundDailyComparison';
import { fundDailySamples, fundDailyNumberSample } from './fund-daily-number-samples';
function view(row: ReturnType<typeof fundDailyNumberSample>, error = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } },
  });
  const key = ['market', 'fund-daily-error', '000001.OF'];
  if (error)
    client
      .getQueryCache()
      .build(client, { queryKey: key })
      .setState({ status: 'error', error: new Error('受控读取失败'), fetchStatus: 'idle' });
  else client.setQueryData(key, row);
  const before = JSON.stringify(client.getQueryData(key));
  try {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FundDailyComparison symbol="000001.OF" />
      </QueryClientProvider>,
    );
    expect(JSON.stringify(client.getQueryData(key))).toBe(before);
    return html;
  } finally {
    client.clear();
  }
}
it.each(fundDailySamples)('$name：每日估算保留精度、非零和原对象', (sample) => {
  const row = fundDailyNumberSample(sample.name);
  const before = JSON.stringify(row);
  const html = view(row);
  expect(html).toContain('收盘估算 ' + sample.estimated);
  expect(html).toContain('正式净值 ' + sample.official);
  expect(html).toContain('估算差额 ');
  expect(html).toContain(sample.difference);
  expect(html).toContain('相对绝对误差 1E-7%');
  expect(html).toContain('定价覆盖 1E-7%');
  expect(html).toContain('低覆盖');
  expect(html).toContain('2026-11-07');
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(JSON.stringify(row)).toBe(before);
});
it('待同日正式净值保持等待语义', () => {
  const row = fundDailyNumberSample('ordinary')!;
  const html = view({ ...row, official: null, errors: null });
  expect(html).toContain('待同日正式净值');
  expect(html).not.toContain('估算差额');
});
it('空结果保留无额外明细', () => {
  expect(view(null)).toBe('');
});
it('读取失败保留实际重试入口', () => {
  const html = view(null, true);
  expect(html).toContain('读取失败');
  expect(html).toContain('重新读取');
  expect(html).not.toContain('待同日正式净值');
});
