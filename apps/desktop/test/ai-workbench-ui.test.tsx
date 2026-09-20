import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AiRunDetail } from '../src/features/ai/AiRunDetail.js';
import { AiRunList } from '../src/features/ai/AiRunList.js';
import { ResearchReportContent } from '../src/features/ai/ResearchReportContent.js';
import { findCitationToolCall } from '../src/features/ai/EvidenceChainSheet.js';
import { researchQuestionTemplates } from '../src/features/ai/ai.templates.js';
import type { AiRunDetail as AiRunDetailRecord, AiRunRecord } from '../src/features/ai/ai.types.js';

const run: AiRunRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'fixture',
  model: 'research-v1',
  promptVersion: 'research-v1',
  status: 'succeeded',
  question: '当前组合最主要的风险是什么？',
  context: { scope: 'portfolio' },
  createdAt: '2026-08-25T12:00:00.000Z',
  result: {
    version: 1,
    provider: 'fixture',
    conclusion: '组合集中度需要持续观察。',
    evidence: [
      {
        claim: '组合集中度较高',
        citations: [
          {
            tool: 'getPortfolio',
            sourceId: 'portfolio-1',
            provider: 'fixture',
            observedAt: '2026-08-25T12:00:00.000Z',
          },
        ],
      },
    ],
    risks: [],
    unknowns: ['新闻来源未配置'],
    signals: [],
    disclaimer: '仅供研究参考。',
    createdAt: '2026-08-25T12:00:00.000Z',
  },
  display: {
    id: '11111111-1111-4111-8111-111111111111',
    question: '当前组合最主要的风险是什么？',
    taskKind: 'research',
    object: { type: 'portfolio', label: '当前投资组合' },
    source: { type: 'portfolio', label: '组合研究' },
    executionStatus: 'succeeded',
    primaryStatus: 'completed',
    resultAvailability: 'available',
    summary: '组合集中度需要持续观察。',
    verificationReason: null,
    dataVersion: 'version-1',
    updatedAt: '2026-08-25T12:00:00.000Z',
    capabilities: {
      canRead: true,
      canReload: true,
      canRetry: false,
      canCancel: false,
      canOpenSource: false,
    },
  },
};

const detail: AiRunDetailRecord = {
  ...run,
  toolCalls: [
    {
      tool: 'getPortfolio',
      permission: 'portfolio:read',
      status: 'ok',
      inputSummary: 'portfolio-1',
      outputSummary: '组合摘要',
    },
  ],
};

describe('研究工作台 UI 契约', () => {
  it('任务列表以六列、摘要、对象、来源、统一状态和时间为主信息', () => {
    const markup = renderToStaticMarkup(
      <AiRunList
        runs={[run]}
        selectedId={run.id}
        status="all"
        source="all"
        includeInternal={false}
        search=""
        loadState="ready"
        refreshing={false}
        onStatusChange={vi.fn()}
        onSourceChange={vi.fn()}
        onIncludeInternalChange={vi.fn()}
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onOpenSource={vi.fn()}
        onRefresh={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(markup).toContain('当前组合最主要的风险是什么？');
    expect(markup).toContain('组合集中度需要持续观察。');
    expect(markup).toContain('当前投资组合 · 对象未提供');
    expect(markup).toContain('组合研究');
    expect(markup).toContain('已完成');
    expect(markup).toContain('data-state="selected"');
    expect(markup).toContain('研究问题');
    expect(markup).toContain('研究对象');
    expect(markup).not.toContain('role="tablist"');
  });

  it('无历史任务时只保留一个主要创建入口，并提供三个可编辑问题模板', () => {
    const markup = renderToStaticMarkup(
      <AiRunDetail
        run={null}
        detail={null}
        isLoading={false}
        onEvidence={vi.fn()}
        onRetry={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(markup.match(/新建研究/g)).toHaveLength(1);
    expect(markup).toContain('justify-start');
    expect(markup).not.toContain('min-h-[30rem]');
    expect(markup).not.toContain('查看问题模板');
    for (const template of researchQuestionTemplates.slice(0, 3)) {
      expect(markup).toContain(template.label);
      expect(markup).toContain(`使用“${template.label}”问题模板`);
    }
    expect(markup).not.toContain(researchQuestionTemplates[3].label);
  });

  it('筛选为空时保留筛选导航且不重复提供创建按钮', () => {
    const listMarkup = renderToStaticMarkup(
      <AiRunList
        runs={[]}
        selectedId={null}
        status="failed"
        source="all"
        includeInternal={false}
        search=""
        loadState="empty"
        refreshing={false}
        onStatusChange={vi.fn()}
        onSourceChange={vi.fn()}
        onIncludeInternalChange={vi.fn()}
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onOpenSource={vi.fn()}
        onRefresh={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    const detailMarkup = renderToStaticMarkup(
      <AiRunDetail
        run={null}
        detail={null}
        isLoading={false}
        emptyState="filtered"
        onEvidence={vi.fn()}
        onRetry={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(listMarkup).toContain('没有匹配的研究');
    expect(listMarkup).toContain('清除条件');
    expect(listMarkup).not.toContain('新建研究');
    expect(detailMarkup).toContain('没有可显示的研究详情');
    expect(detailMarkup).not.toContain('可以先问');
  });

  it('页面复用共享刷新入口，并在 Provider 不可执行时提供配置入口', () => {
    const source = readFileSync(new URL('../src/features/ai/AiChat.tsx', import.meta.url), 'utf8');
    const listSource = readFileSync(
      new URL('../src/features/ai/AiRunList.tsx', import.meta.url),
      'utf8',
    );
    expect(listSource).toContain('<RefreshIconButton');
    expect(source).not.toContain('<RefreshCw');
    expect(source).toContain("navigate('/providers')");
    expect(source).toContain('provider.action');
    expect(source).toContain('data-ai-provider-status');
    expect(source).toContain("label: '服务已就绪'");
    expect(source).not.toContain("label: 'Provider 已就绪'");
    expect(source).toContain('<Button type="button" size="sm"');
    expect(source).toContain('trigger ?? listFallbackRef.current');
    expect(source).toContain('tabIndex={-1}');
    expect(source).not.toContain('<Settings2');
    expect(listSource).toContain("?? '全部状态'");
    expect(listSource).toContain("?? '全部来源'");
  });

  it('再次生成表单由服务端预填并区分普通失败与未知结果风险', () => {
    const source = readFileSync(
      new URL('../src/features/ai/NewResearchSheet.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('useAiResearchRetryPrefillQuery');
    expect(source).toContain('原研究对象已失效，请显式重新选择研究范围或对象');
    expect(source).toContain('我已核对预填的问题、研究对象和问题模板');
    expect(source).toContain('我理解原请求可能仍在外部执行');
    expect(source).toContain('acknowledgeUnknownOutcomeRisk: unknownRiskConfirmed');
  });

  it('共享报告正文按问题、结论、风险、证据、免责声明和折叠运行详情排序', () => {
    const markup = renderToStaticMarkup(<ResearchReportContent run={detail} />);
    expect(markup.indexOf('研究问题与背景')).toBeLessThan(markup.indexOf('核心结论与适用条件'));
    expect(markup.indexOf('核心结论与适用条件')).toBeLessThan(markup.indexOf('风险与未知项'));
    expect(markup.indexOf('风险与未知项')).toBeLessThan(markup.indexOf('证据与来源'));
    expect(markup).toContain('免责声明');
    expect(markup).toContain('<details');
    expect(markup).toContain('历史费用未核对');
    expect(markup).toContain('历史记录没有冻结研究策略');
    expect(markup).not.toContain('modelMetadata');
  });

  it('无效结果只保留邻接标记的未验证文本，不渲染可信报告章节', () => {
    const invalid: AiRunRecord = {
      ...run,
      result: { ...run.result!, evidence: [] },
      display: {
        ...run.display!,
        primaryStatus: 'result_unavailable',
        resultAvailability: 'invalid',
        verificationReason: '引用归属无效',
      },
    };
    const markup = renderToStaticMarkup(<ResearchReportContent run={invalid} />);
    expect(markup).toContain('结果不可用');
    expect(markup).toContain('未验证内容');
    expect(markup).not.toContain('核心结论与适用条件');
  });

  it('详情按结论、风险、证据和未知项顺序展示', () => {
    const detailMarkup = renderToStaticMarkup(
      <AiRunDetail
        run={run}
        detail={detail}
        isLoading={false}
        onEvidence={vi.fn()}
        onRetry={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(detailMarkup.indexOf('结论')).toBeLessThan(detailMarkup.indexOf('主要风险'));
    expect(detailMarkup.indexOf('主要风险')).toBeLessThan(detailMarkup.indexOf('关键证据'));
    expect(detailMarkup).toContain('未知项与限制');
    expect(detailMarkup).toContain('演示模式');
    expect(detailMarkup).toContain('运行详情');
    expect(detailMarkup).not.toContain('<details');
  });

  it('详情读取失败时操作按钮与文字列在同一内容列', () => {
    const detailMarkup = renderToStaticMarkup(
      <AiRunDetail
        run={run}
        detail={null}
        isLoading={false}
        detailError
        onEvidence={vi.fn()}
        onRetry={vi.fn()}
        onDetailRetry={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(detailMarkup).toContain('任务详情读取失败');
    expect(detailMarkup).toContain('col-start-2');
  });

  it('来源链按 citation 的 toolCallId 查找对应 Tool 审计', () => {
    const toolCall = findCitationToolCall('tool-1', [
      {
        id: 'tool-1',
        tool: 'getRisk',
        permission: 'risk:read',
        status: 'ok',
        inputSummary: '{}',
      },
    ]);
    expect(toolCall).toMatchObject({ id: 'tool-1', tool: 'getRisk', status: 'ok' });
    expect(findCitationToolCall('missing', toolCall ? [toolCall] : [])).toBeUndefined();
  });
});
