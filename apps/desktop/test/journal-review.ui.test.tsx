import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '../src/components/ui/toast.js';
import { JournalDashboard } from '../src/features/journal/JournalDashboard.js';
import {
  AiReviewPanel,
  PeriodReviewResult,
  SingleReviewResult,
} from '../src/features/journal/JournalReviewResults.js';
import { ReviewCandidateList } from '../src/features/journal/ReviewCandidateList.js';
import type { JournalReviewCandidate, ReviewTrade } from '../src/features/journal/journal.types.js';

const account = {
  id: 'account-1',
  name: '示例账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};

const candidate: JournalReviewCandidate = {
  id: 'review:account-1:600519.SH:entry:sell',
  accountId: account.id,
  symbol: '600519.SH',
  entryAt: '2026-01-02T09:30:00.000Z',
  exitAt: '2026-01-06T09:30:00.000Z',
  pnl: -120,
  quantity: 100,
  entryPrice: 1450,
  exitPrice: 1388,
  actualExit: 1388,
  plannedEntry: 1440,
  plannedExit: 1510,
  plannedStop: 1400,
  plannedHoldingDays: 2,
  targetWeight: 0.1,
  peakWeight: 0.18,
  evidenceCompleteness: 'complete',
  missingEvidence: [],
  plan: { id: 'plan-1', plannedEntry: 1440, plannedExit: 1510, plannedStop: 1400 },
  sources: {
    entryEventIds: ['entry'],
    exitEventIds: ['sell'],
    journalEntryIds: ['journal-1'],
    planId: 'plan-1',
  },
};

const trade: ReviewTrade = {
  symbol: candidate.symbol,
  entryAt: candidate.entryAt,
  exitAt: candidate.exitAt,
  pnl: candidate.pnl,
  quantity: candidate.quantity,
  entryPrice: candidate.entryPrice,
  exitPrice: candidate.exitPrice,
  actualExit: candidate.actualExit,
  plannedEntry: candidate.plannedEntry,
  plannedExit: candidate.plannedExit,
  plannedStop: candidate.plannedStop,
  plannedHoldingDays: candidate.plannedHoldingDays,
  targetWeight: candidate.targetWeight,
  peakWeight: candidate.peakWeight,
};

const renderJournal = (node: ReactNode) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Toaster>{node}</Toaster>
    </QueryClientProvider>,
  );
};

describe('投资复盘工作台 UI 契约', () => {
  it('默认页面改为账户候选与单笔/周期页签，不展示 JSON 大编辑器', () => {
    const markup = renderJournal(<JournalDashboard accounts={[account]} accountsReady={false} />);
    expect(markup).toContain('单笔复盘');
    expect(markup).toContain('周期复盘');
    expect(markup).toContain('选择一笔已平仓交易');
    expect(markup).not.toContain('CompletedTrade JSON');
    expect(markup).not.toContain('AI Behavior Review');
  });

  it('分别表达账户加载、无账户和候选空态', () => {
    const loading = renderJournal(<JournalDashboard accountsPending />);
    expect(loading).toContain('正在加载账户');

    const noAccounts = renderJournal(<JournalDashboard accounts={[]} />);
    expect(noAccounts).toContain('还没有可用账户');

    const candidates = renderToStaticMarkup(
      <ReviewCandidateList
        candidates={[]}
        filter=""
        onFilterChange={vi.fn()}
        emptyDescription="当前窗口没有交易。"
      />,
    );
    expect(candidates).toContain('暂无已平仓交易');
    expect(candidates).toContain('当前窗口没有交易');
  });

  it('以中文展示候选完整度、行为三态和反事实假设', () => {
    const list = renderToStaticMarkup(
      <ReviewCandidateList
        candidates={[candidate]}
        selectedId={candidate.id}
        filter=""
        onFilterChange={vi.fn()}
      />,
    );
    expect(list).toContain('证据完整');
    expect(list).toContain('600519.SH');

    const result = renderToStaticMarkup(
      <SingleReviewResult
        trade={trade}
        candidate={candidate}
        result={{
          plannedVsActual: { entryDeviation: 10, exitDeviation: -122, holdingDayDeviation: 2 },
          behavior: { winRate: 0, missedStops: 1 },
          counterfactual: {
            actualPnl: -120,
            counterfactualPnl: -50,
            difference: 70,
            assumption: '按计划止损价成交，数量按每笔 1 单位归一化，未计滑点。',
          },
        }}
        aiRun={null}
        aiPending={false}
        aiError={null}
        onExplain={vi.fn()}
      />,
    );
    const noDeviation = renderToStaticMarkup(
      <SingleReviewResult
        trade={{
          ...trade,
          pnl: 20,
          actualExit: 1420,
          exitPrice: 1420,
          plannedExit: 1410,
          peakWeight: 0.08,
          targetWeight: 0.1,
        }}
        candidate={candidate}
        result={{ plannedVsActual: {}, behavior: {}, counterfactual: {} }}
        aiRun={null}
        aiPending={false}
        aiError={null}
        onExplain={vi.fn()}
      />,
    );
    expect(result).toContain('发现偏差');
    expect(noDeviation).toContain('未发现偏差');
    expect(result).toContain('反事实比较');
    expect(result).toContain('按计划止损价成交');
    expect(result).not.toContain('missed-stop');
  });

  it('周期结果保留用户选择的窗口边界', () => {
    const markup = renderToStaticMarkup(
      <PeriodReviewResult
        result={{
          metrics: { winRate: 0.5, profitLossRatio: 2 },
          window: {
            start: '2026-01-01T00:00:00.000Z',
            end: '2026-01-31T23:59:59.000Z',
            tradeCount: 1,
            behavior: { winRate: 0.5, profitLossRatio: 2, missedStops: 0 },
            activity: { turnover: 2900 },
            holding: { average: 4, median: 4 },
          },
        }}
        window={{ start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T23:59:59.000Z' }}
        sampleCount={1}
        aiRun={null}
        aiPending={false}
        aiError={null}
        onExplain={vi.fn()}
      />,
    );
    expect(markup).toContain('周期复盘结果');
    expect(markup).toContain('窗口：');
    expect(markup).toContain('实际请求窗口：');
    expect(markup).toContain('2026');
  });

  it('AI 失败时只在 AI 区域反馈，并保留再次触发入口', () => {
    const markup = renderToStaticMarkup(
      <AiReviewPanel
        aiRun={null}
        isPending={false}
        error={new Error('Provider 暂时不可用')}
        onExplain={vi.fn()}
      />,
    );
    expect(markup).toContain('AI 解读暂时不可用');
    expect(markup).toContain('Provider 暂时不可用');
    expect(markup).toContain('生成 AI 解读');
  });
});
