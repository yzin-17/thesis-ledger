import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { fundDailyErrorSchema } from '@thesis-ledger/schemas';
import { DailyFundComparison } from '../src/features/market-detail/DailyFundComparison';

const state = vi.hoisted(() => ({ calls: 0 }));
vi.mock('react-native', async () => import('react-native-web'));
vi.mock('../src/app/MobileRuntime', async () => {
  const { getMobileTheme } = await import('../src/theme');
  const theme = getMobileTheme('light', 'red-up');
  const scope = ['decimal-ratio'];
  const api = {
    market: {
      getFundDailyError() {
        state.calls++;
        throw new Error('隔离缓存不应请求');
      },
    },
  };
  return { useMobileRuntime: () => ({ theme, scope, api }) };
});
function view(value: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const row =
    value === null
      ? null
      : fundDailyErrorSchema.parse({
          symbol: '000001.OF',
          day: '2026-11-07',
          method: 'disclosed-holdings-qfq-v1',
          estimatedAt: '2026-11-07T07:00:00.000Z',
          estimatedNav: 1.01,
          pricedCoverage: 1e-9,
          quality: 'low_coverage',
          official: {
            unitNav: 1,
            navDate: '2026-11-07T00:00:00.000Z',
            provider: '受控来源',
            upstreamSource: '受控来源',
            fetchedAt: '2026-11-07T08:00:00.000Z',
            servedFromCache: true,
          },
          errors: { signed: '0.01', absolute: '0.01', relativeAbsolute: value },
        });
  client.setQueryData(['decimal-ratio', 'fund-daily-error', '000001.OF'], row);
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DailyFundComparison symbol="000001.OF" />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}
it.each([
  ['0.' + '0'.repeat(399) + '1', '1E-398%'],
  ['0.01005000000000000000001', '1.01%'],
  ['1' + '0'.repeat(400), '1E402%'],
] as const)('实际移动端基金误差 %s 显示 %s', (value, expected) => {
  expect(view(value)).toContain('相对绝对误差 ' + expected);
  expect(view(value)).toContain('定价覆盖 1E-7%');
  expect(state.calls).toBe(0);
});
it('实际移动端成功空集保留空状态', () => {
  expect(view(null)).toContain('尚无有效收盘估算');
  expect(state.calls).toBe(0);
});
