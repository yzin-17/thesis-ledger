import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import {
  researchReportDetailSchema,
  researchResultV2Schema,
  researchResultSchema,
} from '@thesis-ledger/schemas';
import { reportToAiRun } from '../src/features/ai/research-report-display.js';
import { ResearchSavedReport } from '../src/features/ai/ResearchSavedReport.js';
import { AiRunList } from '../src/features/ai/AiRunList.js';

const sample = JSON.parse(
  readFileSync(
    new URL('../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
    'utf8',
  ),
) as { result: unknown };
function detail(mode: 'actual' | 'shadow' = 'actual') {
  const result = researchResultV2Schema.parse(sample.result);
  result.scopeSnapshot.mode = mode;
  return researchReportDetailSchema.parse({
    id: '00000000-0000-4000-8000-000000000044',
    status: 'succeeded',
    question: '受控研究问题',
    createdAt: result.createdAt,
    updatedAt: result.createdAt,
    historicalScope: { status: 'known', snapshot: result.scopeSnapshot },
    resultVersion: 2,
    availability: 'available',
    summary: result.inference.conclusion,
    quality: result.quality,
    errorCode: null,
    errorSummary: null,
    result,
    submission: null,
  });
}
const markup = (report: ReturnType<typeof detail>) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ResearchSavedReport
        report={report}
        onRetry={() => undefined}
        onOpenSource={() => undefined}
      />
    </QueryClientProvider>,
  );
it('V2 保留数值、失效条件、质量、材料和模型字段；模型文本按文本渲染', () => {
  const report = detail();
  if (report.result?.version !== 2) throw new Error('V2 合同缺失');
  report.result.inference.conclusion = '<img src=x onerror=alert(1) />';
  const html = markup(report);
  for (const text of [
    '失效条件',
    '推理依据',
    '数值与假设',
    '未知项',
    '置信依据',
    '证据与来源',
    '材料截止时间',
  ])
    expect(html).toContain(text);
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img');
  expect(html).toContain(report.result.model.modelId);
  expect(html).toContain('0 比率');
  expect(html).not.toContain('0.00 USD');
});
it('资料缺口用中文说明，未识别原因保留缺口状态而不冒充完整', () => {
  const report = detail();
  if (report.result?.version !== 2) throw new Error('V2 合同缺失');
  const quality = {
    status: 'partial' as const,
    reasons: ['news_unavailable', 'unrecognized_quality_code'],
  };
  report.quality = quality;
  report.result.quality = quality;
  const html = markup(report);
  expect(html).toContain('资料不完整');
  expect(html).toContain('本次新闻资料不可用');
  expect(html).toContain('部分资料或来源信息尚不完整');
  expect(html).not.toContain('unrecognized_quality_code');
});
it('另一全局模式不能显示已缓存正文或引用', () => {
  const report = detail('shadow');
  const html = markup(report);
  expect(html).toContain('报告属于另一账户模式');
  expect(html).not.toContain(report.summary!);
  expect(html).not.toContain('材料截止时间');
});
it('旧正文保留待核验标签，不补模式、费用或引用资格', () => {
  const old = researchResultSchema.parse({
    version: 1,
    provider: 'controlled',
    createdAt: '2026-10-19T00:00:00Z',
    conclusion: '受控旧正文',
    evidence: [
      {
        claim: '旧证据',
        citations: [
          {
            tool: 'portfolio',
            sourceId: 'old',
            provider: 'controlled',
            observedAt: '2026-10-19T00:00:00Z',
          },
        ],
      },
    ],
    risks: [],
    unknowns: [],
    disclaimer: '研究参考',
  });
  const report = researchReportDetailSchema.parse({
    ...detail(),
    historicalScope: { status: 'unrecorded', snapshot: null, label: '历史范围未记录' },
    resultVersion: 1,
    availability: 'pending_verification',
    result: old,
    summary: old.conclusion,
    quality: null,
  });
  const projected = reportToAiRun(report);
  expect(projected.context).toBeNull();
  expect(projected.cost).toBeUndefined();
  expect(projected.result).toEqual(old);
  const html = markup(report);
  expect(html).toContain('历史范围未记录');
  expect(html).toContain('受控旧正文');
  expect(html).toContain('引用归属尚待核验');
  expect(html).not.toContain('核对历史引用');
});
it('可见页为空但还有游标时仍能加载；历史页面不提供不可信的来源过滤', () => {
  const props = {
    runs: [],
    selectedId: null,
    status: 'all' as const,
    source: 'all' as const,
    includeInternal: false,
    search: '',
    loadState: 'empty' as const,
    refreshing: false,
    onStatusChange: () => undefined,
    onSourceChange: () => undefined,
    onIncludeInternalChange: () => undefined,
    onSearchChange: () => undefined,
    onSelect: () => undefined,
    onOpenSource: () => undefined,
    onRefresh: () => undefined,
    onClearFilters: () => undefined,
    hasMore: true,
    readView: 'legacy' as const,
  };
  const html = renderToStaticMarkup(<AiRunList {...props} />);
  expect(html).toContain('加载更多');
  expect(html).not.toContain('包含实验内部任务');
  expect(html).not.toContain('aria-label="研究来源"');
});
