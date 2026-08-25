import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AiRunDetail } from '../src/features/ai/AiRunDetail.js';
import { AiRunList } from '../src/features/ai/AiRunList.js';
import { findCitationToolCall } from '../src/features/ai/EvidenceChainSheet.js';
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
  it('任务列表以问题、上下文、状态和时间为主信息，并标记选中任务', () => {
    const markup = renderToStaticMarkup(
      <AiRunList
        runs={[run]}
        selectedId={run.id}
        filter="all"
        loadState="ready"
        onFilterChange={vi.fn()}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(markup).toContain('当前组合最主要的风险是什么？');
    expect(markup).toContain('全组合');
    expect(markup).toContain('已完成');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('overflow-y-hidden');
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
