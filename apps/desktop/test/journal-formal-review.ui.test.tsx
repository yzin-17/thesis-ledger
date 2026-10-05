import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { journalAnalyze } from '@thesis-ledger/domain';
import {
  journalDeterministicReviewSchema,
  journalReviewCandidateContractSchema,
} from '@thesis-ledger/schemas';
import { JournalFactSummary } from '../src/features/journal/review/JournalFactSummary.js';
import { JournalDecimalResult } from '../src/features/journal/review/JournalMetricTable.js';
import { JournalReviewWorkspace } from '../src/features/journal/review/JournalReviewWorkspace.js';
import { JournalSourceFacts } from '../src/features/journal/review/JournalSourceFacts.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';

const candidate = () => {
  const input = journalUiEvidenceFixture();
  return journalReviewCandidateContractSchema.parse({
    input,
    openedAt: input.trade.openedAt,
    effectiveClosedAt: input.trade.closedAt,
    executedAt: null,
    reviewStatus: 'STALE',
    missingEvidence: [],
    statisticsEligibility: { eligible: true, reasons: [] },
  });
};
describe('正式复盘桌面读取', () => {
  it('数量原样展示，旧快照过期与当前统计资格并列', () => {
    const html = renderToStaticMarkup(<JournalFactSummary candidate={candidate()} />);
    expect(html).toContain('2.000000000000000001');
    expect(html).toContain('历史快照已过期');
    expect(html).toContain('符合本粒度统计资格');
  });
  it('片段未知退出时间和收益不借用父周期的已知值', () => {
    const row = candidate();
    row.input.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    row.input.trade.closeSlices[0]!.occurredAt = null;
    row.input.trade.closeSlices[0]!.netRealizedPnl = null;
    const html = renderToStaticMarkup(<JournalFactSummary candidate={row} />);
    expect(html).toMatch(/退出 \/ 结束时间<\/dt><dd>尚未结束或未知/);
    expect(html).toMatch(/实际已实现净收益<\/dt><dd[^>]*>证据不足/);
  });
  it('确定性指标和行为显示中文，保留反事实口径与缺失证据', () => {
    const row = candidate();
    row.input.analysisDraft = { stopLoss: '8' };
    const result = journalDeterministicReviewSchema.parse(journalAnalyze(row));
    const html = renderToStaticMarkup(<JournalDecimalResult result={result} />);
    expect(html).toContain('实际入场价');
    expect(html).toContain('按止损价退出的假设净收益');
    expect(html).toContain('证据不足');
    expect(html).toContain('实际数量');
    expect(html).not.toContain('INSUFFICIENT_EVIDENCE');
  });
  it('失效深链账户不回退显示另一账户的事实', () => {
    const accounts = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: '可用账户',
        type: 'securities' as const,
        mode: 'actual' as const,
        currency: 'USD' as const,
      },
    ];
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <JournalReviewWorkspace accounts={accounts} search="?accountId=missing" />
      </QueryClientProvider>,
    );
    expect(html).toContain('复盘账户不可用');
    expect(html).not.toContain('role="tabpanel"');
  });
  it('深链模式与账户不符时拒绝显示事实', () => {
    const accounts = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: '可用账户',
        type: 'securities' as const,
        mode: 'actual' as const,
        currency: 'USD' as const,
      },
    ];
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <JournalReviewWorkspace
          accounts={accounts}
          search={`?accountId=${accounts[0]!.id}&mode=shadow`}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('复盘账户不可用');
    expect(html).not.toContain('role="tabpanel"');
  });
  it('单次减仓不展示没有参与其成本分配的基线观察', () => {
    const row = candidate();
    row.input.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: 'trade-1',
      closeSliceId: 'slice-1',
    };
    row.input.trade.baselineComponents.push({
      id: 'unrelated-baseline',
      eventId: '00000000-0000-4000-8000-000000000060',
      factId: '00000000-0000-4000-8000-000000000061',
      batchId: '00000000-0000-4000-8000-000000000062',
      batchScope: 'PARTIAL',
      occurredAt: null,
      currency: 'USD',
      observedQuantity: '999',
      quantity: '999',
      remainingQuantity: '999',
      averageCost: '777',
      rawCost: '776223',
      remainingCost: '776223',
      rawCostEstimated: true,
      costIncludesFees: 'UNKNOWN',
      reconciledExecutionFactIds: [],
      reconciliationFactIds: [],
    });
    const html = renderToStaticMarkup(<JournalSourceFacts input={row.input} />);
    expect(html).not.toContain('999');
    expect(html).not.toContain('777');
    expect(html).not.toContain('基线观察');
  });
});
