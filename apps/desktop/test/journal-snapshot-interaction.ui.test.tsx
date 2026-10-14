// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyze } from '@thesis-ledger/domain';
import {
  journalDeterministicReviewSchema,
  journalStoredSnapshotViewSchema,
} from '@thesis-ledger/schemas';
import { JournalSnapshotHistory } from '../src/features/journal/review/JournalSnapshotHistory.js';
import {
  journalClick,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({ history: vi.fn(), snapshot: vi.fn() }));
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
  beforeEach(() => vi.clearAllMocks());
  it('历史快照展示保存时成交、计划、草稿、AI 元数据，不重算旧结果', async () => {
    const row = current();
    api.history.mockResolvedValue({ items: [row], nextCursor: null });
    api.snapshot.mockResolvedValue(row);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    const label = '2026-01-05T00:00:00Z · AAPL.US · 完整交易周期 · 证据已变化';
    await journalWait(() => expect(view.host.textContent).toContain(label));
    await journalClick(label);
    await journalWait(() => expect(view.host.textContent).toContain('历史结果 · 证据已变化'));
    expect(view.host.textContent).toContain('真实退出成交');
    expect(view.host.textContent).toContain('原始计划');
    expect(view.host.textContent).toContain('保存时草稿');
    expect(view.host.textContent).toContain('本次清除');
    expect(view.host.textContent).toContain('保存时模型');
    expect(api.snapshot.mock.calls[0]!.slice(0, 2)).toEqual([
      '00000000-0000-4000-8000-000000000099',
      { accountId: props.accountId, mode: 'actual' },
    ]);
    for (const pre of view.host.querySelectorAll('pre'))
      expect(pre.closest('details')?.open).toBe(false);
  });
  it('列表失败和详情失败分别局部重试，不误报为空', async () => {
    const row = current();
    api.history
      .mockRejectedValueOnce(new Error('列表断开'))
      .mockResolvedValue({ items: [row], nextCursor: null });
    api.snapshot.mockRejectedValueOnce(new Error('详情断开')).mockResolvedValue(row);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('历史列表读取失败'));
    expect(view.host.textContent).not.toContain('没有复盘快照');
    await journalClick('重新读取');
    const label = '2026-01-05T00:00:00Z · AAPL.US · 完整交易周期 · 证据已变化';
    await journalWait(() => expect(view.host.textContent).toContain(label));
    await journalClick(label);
    await journalWait(() => expect(view.host.textContent).toContain('历史快照读取失败'));
    await journalClick('重新读取');
    await journalWait(() => expect(view.host.textContent).toContain('保存时的本次草稿'));
  });
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
    api.history.mockResolvedValue({ items: [legacy], nextCursor: null });
    api.snapshot.mockResolvedValue(legacy);
    const view = await mountJournal(<JournalSnapshotHistory {...props} />);
    await journalWait(() => expect(view.host.textContent).toContain('旧快照待确认'));
    await journalClick('2026-01-05T00:00:00Z · 旧快照待确认');
    await journalWait(() => expect(view.host.textContent).toContain('高级调试：旧快照原始记录'));
    expect(view.host.querySelector('pre')?.closest('details')?.open).toBe(false);
    expect(view.host.textContent).not.toContain('确定性复盘结果');
  });
});
