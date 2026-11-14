// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { journalAnalyze, journalAnalyzePeriod } from '@thesis-ledger/domain';
import {
  journalDeterministicReviewSchema,
  journalPeriodReviewResultSchema,
} from '@thesis-ledger/schemas';
import { browserJournalCandidate } from './browser-journal-candidate.fixture.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';
import { JournalDecimalResult } from '../src/features/journal/review/JournalMetricTable.js';
import { JournalPeriodResult } from '../src/features/journal/review/JournalPeriodResult.js';

const window = { start: '2026-01-01T00:00:00Z', end: '2026-01-10T00:00:00Z' };
function mount(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}
const candidate = () => browserJournalCandidate(journalUiEvidenceFixture());

describe('复盘阅读顺序与冻结结果', () => {
  it('计划、实际与偏差同行，反事实单独呈现，不修改原结果', () => {
    const input = candidate();
    input.input.analysisDraft = {
      plannedEntry: '9',
      plannedExit: '13',
      stopLoss: '8',
      expectedHoldingDays: 1,
    };
    const result = journalDeterministicReviewSchema.parse(journalAnalyze(input));
    const before = JSON.stringify(result);
    const host = mount(renderToStaticMarkup(<JournalDecimalResult result={result} />));
    const table = host.querySelector('table[aria-label="计划与实际对照"]')!;
    expect(table.querySelector('thead')?.textContent).toBe('项目计划实际偏差');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain(result.metrics.plannedEntryPrice!.value);
    expect(rows[0]?.textContent).toContain(result.metrics.actualEntryPrice!.value);
    expect(rows[0]?.textContent).toContain(result.metrics.entryPriceDeviation!.value);
    const hypothetical = host.querySelector('[aria-label="反事实假设结果"]')!;
    expect(hypothetical.textContent).toContain('不是实际成交或实际收益');
    expect(table.textContent).not.toContain('假设净收益');
    expect(JSON.stringify(result)).toBe(before);
  });

  it('缺计划的证据及其不能计算的偏差保留在对照行', () => {
    const input = candidate();
    input.input.plan = null;
    input.input.analysisDraft = null;
    const result = journalDeterministicReviewSchema.parse(journalAnalyze(input));
    const host = mount(renderToStaticMarkup(<JournalDecimalResult result={result} />));
    const row = host.querySelector('table[aria-label="计划与实际对照"] tbody tr')!;
    expect(row.textContent).toContain('证据不足');
    expect(row.textContent).toContain('缺少计划入场价');
  });

  it('双零只显示样本概览及不可计算原因，原指标仍能按需查阅', () => {
    const result = journalPeriodReviewResultSchema.parse(journalAnalyzePeriod([], window));
    const host = mount(renderToStaticMarkup(<JournalPeriodResult result={result} />));
    const table = host.querySelector('table')!;
    expect(table.querySelector('thead')?.textContent).toBe('指标完整交易周期单次减仓');
    expect(table.querySelector('tbody tr')?.textContent).toBe('合格样本数00');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      '无法计算胜率、盈亏比和平均持有天数',
    );
    expect(host.querySelector('pre')?.textContent).toContain('NOT_APPLICABLE');
  });

  it('单组为零继续展示另一组，区分零、不适用与证据不足', () => {
    const result = journalPeriodReviewResultSchema.parse(
      journalAnalyzePeriod([candidate()], window),
    );
    result.tradeCycles.metrics.netRealizedPnl = {
      status: 'AVAILABLE',
      value: '0',
      unit: 'AMOUNT',
      currency: 'USD',
      missingEvidence: [],
    };
    const before = JSON.stringify(result);
    const host = mount(renderToStaticMarkup(<JournalPeriodResult result={result} />));
    const table = host.querySelector('table')!;
    expect(table.querySelector('tbody tr')?.textContent).toBe('合格样本数10');
    expect(table.textContent).toContain('0 USD');
    expect(table.textContent).toContain('不适用');
    expect(table.textContent).toContain('证据不足');
    expect(table.textContent).toContain('没有亏损样本，盈亏比无法计算');
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(JSON.stringify(result)).toBe(before);
  });

  it('排除和时间未知的样本分别保留原因及入口', () => {
    const result = journalPeriodReviewResultSchema.parse(journalAnalyzePeriod([], window));
    result.tradeCycles.observedSampleCount = 1;
    result.tradeCycles.excluded = [
      { reviewObjectId: 'TRADE_CYCLE:excluded', reasons: ['ESTIMATED_COST'] },
    ];
    result.unknownTime = [
      { reviewObjectId: 'CLOSE_SLICE:unknown', reasons: ['STATISTICS_TIME_UNKNOWN'] },
    ];
    const host = mount(
      renderToStaticMarkup(<JournalPeriodResult result={result} onSelect={() => undefined} />),
    );
    expect(host.textContent).toContain('成本含估算');
    expect(host.textContent).toContain('时间未知的样本（1）');
    expect(host.textContent).toContain('统计时间未知');
    expect(host.querySelectorAll('button')).toHaveLength(2);
  });
});
