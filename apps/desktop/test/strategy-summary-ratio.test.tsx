import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';
import { strategySchema } from '@thesis-ledger/schemas';
import { expect, it } from 'vitest';
import { StrategyVersionPage } from '../src/features/strategy/StrategyLibraryPages';
import { strategyVersionSummary } from '../src/features/strategy/strategy-version-summary.model';
import { strategySummarySamples, strategySummaryVersion } from './strategy-summary-ratio-samples';

it.each(strategySummarySamples)('$name 的真实定义与页面保留三位规则', (sample) => {
  const version = strategySummaryVersion(
      sample.ratio,
      sample.cost,
      'target' in sample && sample.target,
    ),
    before = JSON.stringify(version);
  expect(strategySchema.safeParse(version.schema).success).toBe(true);
  const summary = strategyVersionSummary(version);
  expect(summary.kind).toBe('ready');
  if (summary.kind !== 'ready') return;
  const section = (label: string) => summary.sections.find((s) => s.label === label)!.value;
  expect(section('仓位管理')).toBe(
    ('target' in sample ? '目标仓位 ' : '每次使用权益的 ') + sample.expected,
  );
  expect(section('风险约束')).toBe('固定止损 ' + sample.expected + '；固定止盈 ' + sample.expected);
  expect(section('执行假设')).toContain(
    '佣金率 ' + sample.costExpected + '，滑点率 ' + sample.costExpected,
  );
  const html = renderToStaticMarkup(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } })}
    >
      <MemoryRouter initialEntries={['/strategy/ratio-strategy/ratio-version']}>
        <Routes>
          <Route
            path="/strategy/:strategyId/:versionId"
            element={
              <StrategyVersionPage
                strategies={[
                  {
                    id: 'ratio-strategy',
                    name: '精度验收策略',
                    status: 'active',
                    versions: [version],
                  },
                ]}
                loading={false}
                tabState={{ sourceKey: 'ratio-strategy:ratio-version', value: 'definition' }}
                onTabChange={() => {}}
                onBacktest={() => {}}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(html).toContain('固定止损 ' + sample.expected);
  expect(html).toContain('佣金率 ' + sample.costExpected);
  expect(html).toContain('冻结说明：仓位 0.00%');
  expect(html).not.toContain('Infinity%');
  expect(JSON.stringify(version)).toBe(before);
});
it('缺失与非法定义继续关闭操作入口', () => {
  const missing = strategySummaryVersion('0.25');
  delete missing.schema!.entry;
  expect(strategyVersionSummary(missing)).toEqual({ kind: 'missing', missing: ['入场条件'] });
  expect(strategyVersionSummary(strategySummaryVersion('0')).kind).toBe('invalid');
});
