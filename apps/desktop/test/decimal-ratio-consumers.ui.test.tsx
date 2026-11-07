import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { NavBacktestResult } from '../src/features/strategy/NavBacktestResult';
import { NavBacktestModel } from '../src/features/strategy/NavBacktestModel';
import { FundDailyComparison } from '../src/features/market-detail/FundDailyComparison';
import { navRatioModel, navRatioResult, fundRatioRow, tinyRatio } from './decimal-ratio-samples';

it.each([
  ['0.01005000000000000000001', '1.01%'],
  [tinyRatio, '1E-398%'],
  ['-' + tinyRatio, '-1E-398%'],
  ['1' + '0'.repeat(400), '1E402%'],
] as const)('实际冻结结果指标 %s 保留文本值 %s', (value, expected) => {
  const result = navRatioResult(value);
  const before = JSON.stringify(result);
  const html = renderToStaticMarkup(<NavBacktestResult result={result} />);
  expect(html).toContain(expected);
  expect(html).toContain('1E-398%');
  expect(html).toContain('1.234567890123456789');
  expect(html).toContain('缺少有效估值');
  expect(html).toContain('冻结说明：收益 0.00%');
  expect(JSON.stringify(result)).toBe(before);
});
it.each([
  [tinyRatio, '1E-398%'],
  ['0.3333333333333333333333', '33.333333%'],
  ['0.01', '1%'],
  ['10', '1,000%'],
] as const)('实际模型费率 %s 保持最多六位 %s', (rate, expected) => {
  const text = JSON.stringify(navRatioModel(rate));
  const html = renderToStaticMarkup(
    <NavBacktestModel
      text={text}
      symbol="000001.OF"
      startDate="2026-09-08"
      endDate="2026-09-15"
      confirmed={false}
      onChange={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(html).toContain('费率 ' + expected);
  expect(html).toContain('确认费用与确认结算模型');
});
it.each([
  [tinyRatio, '1E-398%'],
  ['0.01005000000000000000001', '1.01%'],
  ['1' + '0'.repeat(400), '1E402%'],
] as const)('实际基金误差读取 %s 展示 %s', (value, expected) => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(['market', 'fund-daily-error', '000001.OF'], fundRatioRow(value));
  try {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FundDailyComparison symbol="000001.OF" />
      </QueryClientProvider>,
    );
    expect(html).toContain('相对绝对误差 ' + expected);
    expect(html).toContain('定价覆盖 1E-7%');
    expect(html).toContain('低覆盖');
  } finally {
    client.clear();
  }
});
