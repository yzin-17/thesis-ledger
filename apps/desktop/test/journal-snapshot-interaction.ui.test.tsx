// @vitest-environment jsdom
import { journalExplanationResult } from './journal-ai-session.fixture.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyze, journalAnalyzePeriod } from '@thesis-ledger/domain';
import { act } from 'react';
import {
  journalDeterministicReviewSchema,
  journalStoredSnapshotViewSchema,
} from '@thesis-ledger/schemas';
import { JournalSnapshotHistory } from '../src/features/journal/review/JournalSnapshotHistory.js';
import { formatDateTime } from '../src/lib/date-display.js';
import {
  journalClick,
  journalFill,
  journalDeferred,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({
  history: vi.fn(),
  snapshot: vi.fn(),
  explanation: vi.fn(),
  periodHistory: vi.fn(),
  periodSnapshot: vi.fn(),
}));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const props = {
  accountId: '00000000-0000-4000-8000-000000000001',
  mode: 'actual' as const,
  reviewObjectId: null,
};
const current = () => {
  const candidate = journalMountedCandidate();
  candidate.input.analysisDraft = { plannedExit: '13', stopLoss: null, note: '保存时草稿' };
  const result = journalDeterministicReviewSchema.parse(journalAnalyze(candidate));
  result.aiExplanation = {
    id: '00000000-0000-4000-8000-000000000098',
    provider: '保存时 Provider',
    model: '保存时模型',
    promptVersion: '保存时-v2',
    status: 'succeeded',
  };
  return journalStoredSnapshotViewSchema.parse({
    compatibility: 'CURRENT_CONTRACT',
    accountId: props.accountId,
    mode: props.mode,
    snapshot: {
      id: '00000000-0000-4000-8000-000000000099',
      inputSnapshot: candidate.input,
      outputSnapshot: result,
      status: 'STALE',
      createdAt: '2026-01-05T00:00:00Z',
    },
  });
};
describe('历史快照交互', () => {
  const suiteScope = journalSnapshotTestContext();
  registerJournalSnapshotPagingCases(suiteScope);
  registerJournalSnapshotScopeRefreshCases(suiteScope);
  registerJournalSnapshotFrozenDetailCases();
  registerJournalSnapshotCompatibilityCases(suiteScope);
});

function journalSnapshotTestContext() {
  beforeEach(() => {
    vi.clearAllMocks();
    api.periodHistory.mockResolvedValue({ items: [], nextCursor: null });
    const row = current();
    api.explanation.mockResolvedValue({
      id: row.snapshot.outputSnapshot.aiExplanation!.id,
      accountId: props.accountId,
      mode: props.mode,
      reviewObjectId: row.snapshot.inputSnapshot.reference.reviewObjectId,
      evidenceFingerprint: row.snapshot.inputSnapshot.projection.evidenceFingerprint,
      analysisDraft: row.snapshot.inputSnapshot.analysisDraft,
      algorithmVersion: row.snapshot.outputSnapshot.algorithmVersion,
      provider: '保存时 Provider',
      model: '保存时模型',
      promptVersion: '保存时-v2',
      status: 'succeeded',
      errorSummary: null,
      result: journalExplanationResult('这是保存到快照中的 AI 解读正文'),
    });
  });
  const period = (createdAt = '2026-01-06T00:00:00Z') => {
    const window = { start: '2026-01-01T00:00:00Z', end: '2026-01-04T00:00:00Z' };
    return {
      id: '00000000-0000-4000-8000-000000000099',
      ...props,
      ...window,
      symbol: null,
      createdAt,
      aiExplanation: null,
      analysis: { result: journalAnalyzePeriod([], window) },
    };
  };
  const singlePage = (items: ReturnType<typeof current>[], nextCursor: string | null = null) => ({
    items,
    nextCursor,
    instrumentDirectory: { items: [{ symbol: 'AAPL.US', displayName: '苹果' }] },
  });
  return {
    get period() {
      return period;
    },
    get singlePage() {
      return singlePage;
    },
  };
}
function registerJournalSnapshotPagingCases(
  suiteScope: ReturnType<typeof journalSnapshotTestContext>,
) {
  it('两类快照共用一张表，按保存时间倒序；相同 ID 仍打开各自冻结详情', async () => {
    api.history.mockResolvedValue(suiteScope.singlePage([current()]));
    api.periodHistory.mockResolvedValue({ items: [suiteScope.period()], nextCursor: null });
    api.snapshot.mockResolvedValue(current());
    api.periodSnapshot.mockResolvedValue(suiteScope.period());
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.querySelectorAll('tbody tr')).toHaveLength(2));
    expect(view.host.querySelectorAll('table')).toHaveLength(1);
    const rows = view.host.querySelectorAll('tbody tr');
    expect(rows[0]?.textContent).toContain('周期复盘');
    expect(rows[0]?.textContent).toContain('未保存');
    expect(rows[1]?.textContent).toContain('单笔复盘');
    expect(rows[1]?.textContent).toContain('苹果 · AAPL.US');
    expect(rows[1]?.textContent).toContain('证据已变化');
    await act(async () => (rows[0]?.querySelector('button') as HTMLButtonElement).click());
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain(
        '保存时的冻结结果',
      ),
    );
    expect(api.periodSnapshot).toHaveBeenCalledWith(
      suiteScope.period().id,
      { accountId: props.accountId, mode: 'actual' },
      expect.anything(),
    );
    expect(api.snapshot).not.toHaveBeenCalled();
    await journalClick('关闭');
    await act(async () => (rows[1]?.querySelector('button') as HTMLButtonElement).click());
    await journalWait(() => expect(api.snapshot).toHaveBeenCalled());
  });
  it('混合分页不漏行、不重复，不提前展示另一类较旧记录，分页名称继续保留', async () => {
    const all = Array.from({ length: 21 }, (_, index) => {
      const row = current();
      row.snapshot.id = `single-${index}`;
      row.snapshot.createdAt = new Date(Date.UTC(2026, 0, 30 - index)).toISOString();
      return row;
    });
    api.history.mockImplementation(({ cursor }) =>
      Promise.resolve(
        cursor
          ? suiteScope.singlePage(all.slice(20))
          : suiteScope.singlePage(all.slice(0, 20), 'next-single'),
      ),
    );
    api.periodHistory.mockResolvedValue({ items: [suiteScope.period()], nextCursor: null });
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.querySelectorAll('tbody tr')).toHaveLength(20));
    expect(view.host.querySelector('tbody')?.textContent).not.toContain('周期复盘');
    await journalClick('读取下一页快照');
    await journalWait(() => expect(view.host.querySelectorAll('tbody tr')).toHaveLength(22));
    expect(view.host.querySelector('tbody tr:last-child')?.textContent).toContain('周期复盘');
    expect(view.host.querySelectorAll('tbody tr')[20]?.textContent).toContain('苹果 · AAPL.US');
    expect(api.history).toHaveBeenCalledTimes(2);
    expect(api.periodHistory).toHaveBeenCalledTimes(1);
    expect(view.host.textContent).not.toContain('读取下一页快照');
  });
  it('保存时间筛选同时约束两类快照，周期分页越过不命中的整页后继续查找', async () => {
    api.history.mockResolvedValue(suiteScope.singlePage([]));
    api.periodHistory.mockImplementation(({ cursor }) => {
      if (cursor === 'older') return Promise.resolve({ items: [], nextCursor: null });
      if (cursor)
        return Promise.resolve({
          items: [suiteScope.period(), { ...suiteScope.period('2026-01-04T00:00:00Z'), id: 'old' }],
          nextCursor: 'older',
        });
      return Promise.resolve({
        items: [{ ...suiteScope.period('2026-01-09T00:00:00Z'), id: 'new' }],
        nextCursor: 'next-period',
      });
    });
    const view = await mountJournal(
      <JournalSnapshotHistory {...props} reviewObjectId="TRADE_CYCLE:scope" />,
    );
    await journalWait(() => expect(view.host.textContent).toContain('没有复盘快照'));
    await view.render(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(api.periodHistory).toHaveBeenCalled());
    api.periodHistory.mockClear();
    await journalFill('快照开始时间', '2026-01-05T00:00:00Z');
    await journalFill('快照结束时间', '2026-01-09T00:00:00Z');
    await journalClick('查询历史');
    await journalWait(() => expect(view.host.querySelectorAll('tbody tr')).toHaveLength(1));
    expect(view.host.querySelector('tbody')?.textContent).toContain(
      formatDateTime('2026-01-06T00:00:00Z'),
    );
    expect(api.periodHistory).toHaveBeenCalledTimes(2);
    expect(api.history).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start: '2026-01-05T00:00:00.000Z',
        end: '2026-01-09T00:00:00.000Z',
      }),
      expect.anything(),
    );
  });
}
function registerJournalSnapshotScopeRefreshCases(
  suiteScope: ReturnType<typeof journalSnapshotTestContext>,
) {
  it('对象历史保留单笔范围；全账户两类均为空时只显示一个空态', async () => {
    api.history.mockResolvedValue(suiteScope.singlePage([]));
    const view = await mountJournal(
      <JournalSnapshotHistory {...props} reviewObjectId="TRADE_CYCLE:scope" />,
    );
    await journalWait(() => expect(view.host.textContent).toContain('没有复盘快照'));
    expect(api.periodHistory).not.toHaveBeenCalled();
    await view.render(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(api.periodHistory).toHaveBeenCalled());
    expect(view.host.querySelectorAll('[data-slot="empty"]')).toHaveLength(1);
  });
  it('刷新保留原行，等待两类请求全部结束才收起唯一加载圈', async () => {
    api.history.mockResolvedValue(suiteScope.singlePage([current()]));
    api.periodHistory.mockResolvedValue({ items: [suiteScope.period()], nextCursor: null });
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.querySelectorAll('tbody tr')).toHaveLength(2));
    const slow = journalDeferred<{
      items: ReturnType<typeof suiteScope.period>[];
      nextCursor: null;
    }>();
    api.periodHistory.mockReturnValueOnce(slow.promise);
    await act(async () => {
      void view.client.invalidateQueries({ queryKey: ['journal-review-history'] });
    });
    await journalWait(() =>
      expect(view.host.querySelectorAll('[data-slot="list-refresh"]')).toHaveLength(1),
    );
    expect(view.host.querySelectorAll('tbody tr')).toHaveLength(2);
    await act(async () => slow.resolve({ items: [suiteScope.period()], nextCursor: null }));
    await journalWait(() =>
      expect(view.host.querySelectorAll('[data-slot="list-refresh"]')).toHaveLength(0),
    );
  });
}
function registerJournalSnapshotFrozenDetailCases() {
  it('历史快照展示保存时成交、计划、草稿、AI 元数据，不重算旧结果', async () => {
    const row = current();
    api.history.mockResolvedValue({
      items: [row],
      nextCursor: null,
      instrumentDirectory: { items: [] },
    });
    api.snapshot.mockResolvedValue(row);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('AAPL.US'));
    expect(view.host.textContent).not.toContain('当前显示此账户全部对象');
    expect(view.host.textContent).not.toContain('复盘快照');
    expect(view.host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.host.querySelector('thead')?.textContent).toContain('保存时间');
    expect(view.host.querySelector('tbody')?.textContent).toContain(
      formatDateTime('2026-01-05T00:00:00Z'),
    );
    expect(view.host.querySelector('tbody')?.textContent).toContain('完整交易周期');
    expect(view.host.querySelector('tbody')?.textContent).toContain('证据已变化');
    await journalClick('查看快照');
    await journalWait(() => {
      const sheet = document.querySelector('[data-slot="sheet-content"][data-side="right"]');
      expect(sheet?.textContent).toContain('历史结果 · 证据已变化');
    });
    const sheet = document.querySelector('[data-slot="sheet-content"]')!;
    expect(view.host.textContent).not.toContain('历史结果 · 证据已变化');
    expect(sheet.querySelector('[data-slot="card"]')).toBeNull();
    expect(sheet.textContent).toContain('真实退出成交');
    expect(sheet.textContent).toContain('原始计划');
    expect(sheet.textContent).toContain('保存时草稿');
    expect(sheet.textContent).toContain('本次清除');
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain(
        '这是保存到快照中的 AI 解读正文',
      ),
    );
    expect(sheet.querySelectorAll('[aria-label="保存时的 AI 解读"]')).toHaveLength(1);
    expect(api.explanation).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000098',
      { accountId: props.accountId, mode: props.mode },
      expect.anything(),
    );
    expect(view.host.querySelector('tbody tr')?.getAttribute('data-state')).toBe('selected');
    expect(api.snapshot.mock.calls[0]!.slice(0, 2)).toEqual([
      '00000000-0000-4000-8000-000000000099',
      { accountId: props.accountId, mode: 'actual' },
    ]);
    for (const pre of sheet.querySelectorAll('pre'))
      expect(pre.closest('details')?.open).toBe(false);
    await journalClick('关闭');
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull(),
    );
    expect(view.host.querySelector('tbody tr')?.getAttribute('data-state')).toBeNull();
    expect(view.host.querySelector('button[aria-pressed="false"]')?.textContent).toBe('查看快照');
  });
  it('没有关联 AI 的快照不会读取或展示独立 AI 解读', async () => {
    const row = current();
    if (row.compatibility !== 'CURRENT_CONTRACT') throw new Error('unexpected fixture');
    delete row.snapshot.outputSnapshot.aiExplanation;
    api.history.mockResolvedValue({
      items: [row],
      nextCursor: null,
      instrumentDirectory: { items: [] },
    });
    api.snapshot.mockResolvedValue(row);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('AAPL.US'));
    await journalClick('查看快照');
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain(
        '保存时的本次草稿',
      ),
    );
    expect(document.querySelector('[aria-label="保存时的 AI 解读"]')).toBeNull();
    expect(api.explanation).not.toHaveBeenCalled();
  });
  it('列表失败和详情失败分别局部重试，不误报为空', async () => {
    const row = current();
    api.history
      .mockRejectedValueOnce(new Error('列表断开'))
      .mockResolvedValue({ items: [row], nextCursor: null, instrumentDirectory: { items: [] } });
    api.snapshot.mockRejectedValueOnce(new Error('详情断开')).mockResolvedValue(row);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('历史列表读取失败'));
    expect(view.host.textContent).not.toContain('没有复盘快照');
    await journalClick('重新读取');
    await journalWait(() => expect(view.host.textContent).toContain('AAPL.US'));
    await journalClick('查看快照');
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain(
        '历史快照读取失败',
      ),
    );
    await journalClick('重新读取');
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain(
        '保存时的本次草稿',
      ),
    );
  });
}
function registerJournalSnapshotCompatibilityCases(
  suiteScope: ReturnType<typeof journalSnapshotTestContext>,
) {
  it('不可安全适配的旧快照仅在高级调试中保留原始记录', async () => {
    const legacy = {
      compatibility: 'LEGACY_UNSUPPORTED',
      id: '00000000-0000-4000-8000-000000000097',
      accountId: props.accountId,
      mode: 'actual',
      createdAt: '2026-01-05T00:00:00Z',
      inputSnapshot: { historical: '仅供核查' },
      outputSnapshot: {},
    };
    api.history.mockResolvedValue({
      items: [legacy],
      nextCursor: null,
      instrumentDirectory: { items: [] },
    });
    api.snapshot.mockResolvedValue(legacy);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('旧快照待确认'));
    await journalClick('查看快照');
    await journalWait(() =>
      expect(document.querySelector('[data-slot="sheet-content"]')?.textContent).toContain(
        '高级调试：旧快照原始记录',
      ),
    );
    const sheet = document.querySelector('[data-slot="sheet-content"]')!;
    expect(sheet.querySelector('pre')?.closest('details')?.open).toBe(false);
    expect(sheet.textContent).toContain(`保存于 ${formatDateTime(legacy.createdAt)}`);
    expect(sheet.textContent).not.toContain('确定性复盘结果');
  });
  it('周期快照样本下钻读取保存时事实，保持冻结结果且不请求当前对象', async () => {
    const candidate = journalMountedCandidate();
    const saved = {
      ...suiteScope.period(),
      analysis: {
        candidates: [candidate],
        result: journalAnalyzePeriod([candidate], suiteScope.period()),
      },
    };
    const frozen = JSON.stringify(saved);
    api.history.mockResolvedValue(suiteScope.singlePage([]));
    api.periodHistory.mockResolvedValue({ items: [saved], nextCursor: null });
    api.periodSnapshot.mockResolvedValue(saved);
    await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() =>
      expect(document.querySelector('tbody')?.textContent).toContain('周期复盘'),
    );
    await journalClick('查看快照');
    await journalWait(() =>
      expect(document.querySelector('table[aria-label="两种统计粒度对照"]')).not.toBeNull(),
    );
    const sheet = document.querySelector('[data-slot="sheet-content"]')!;
    const samples = [...sheet.querySelectorAll('summary')].find((item) =>
      item.textContent?.includes('完整交易周期 · 样本与排除原因'),
    )!;
    await act(async () => samples.click());
    await journalClick(candidate.input.reference.reviewObjectId);
    const facts = document.querySelector('[aria-label="保存时的样本事实"]')!;
    expect(facts.textContent).toContain(candidate.input.trade.symbol);
    expect(facts.textContent).toContain(candidate.input.trade.sourceQuantity);
    expect(JSON.stringify(saved)).toBe(frozen);
    expect(api.snapshot).not.toHaveBeenCalled();
  });
}
