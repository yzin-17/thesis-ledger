// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalCandidateBrowser } from '../src/features/journal/review/JournalCandidateBrowser.js';
import { JournalFactSummary } from '../src/features/journal/review/JournalFactSummary.js';
import { JournalReviewWorkspace } from '../src/features/journal/review/JournalReviewWorkspace.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';
import {
  browserJournalCandidate,
  browserJournalLegacy,
} from './browser-journal-candidate.fixture.js';
import { journalBrowserStateFixture } from './browser-journal-state.fixture.js';
import {
  journalButton,
  journalClick,
  journalDeferred,
  journalFill,
  journalMountedCandidate,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({ candidates: vi.fn(), history: vi.fn(), object: vi.fn() }));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const accountId = '00000000-0000-4000-8000-000000000001';
const props = {
  accountId,
  mode: 'actual' as const,
  symbol: '',
  onSelect: vi.fn(),
  onWindowApplied: vi.fn(),
};
const page = () => ({
  items: [journalMountedCandidate()],
  legacyItems: [],
  nextCursor: null as string | null,
});

describe('候选、局部状态与工作台隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    journalBrowserStateFixture.state = 'ready';
    api.candidates.mockResolvedValue(page());
    api.history.mockResolvedValue({ items: [], nextCursor: null });
  });
  it.each(['active', 'baseline', 'unknown-time', 'close-slice'] as const)(
    '消费服务端 %s 状态并保留未知事实',
    async (state) => {
      journalBrowserStateFixture.state = state;
      const candidate = browserJournalCandidate(journalUiEvidenceFixture());
      const view = await mountJournal(<JournalFactSummary candidate={candidate} />);
      if (state === 'active') expect(view.host.textContent).toContain('持有中周期');
      if (state === 'baseline') {
        expect(view.host.textContent).toContain('基线观察（不是成交）');
        expect(view.host.textContent).toContain('估算成本');
        expect(view.host.textContent).toContain('不进入本粒度默认统计');
      }
      if (state === 'unknown-time') expect(view.host.querySelector('dd')?.textContent).toBe('未知');
      if (state === 'close-slice') expect(view.host.textContent).toContain('单次减仓');
      for (const raw of view.host.querySelectorAll('pre'))
        expect(raw.closest('details')?.open).toBe(false);
    },
  );
  it('STALE 与服务端统计排除可并列，完整事实不使客户端自行恢复资格', async () => {
    const candidate = journalMountedCandidate();
    candidate.reviewStatus = 'STALE';
    candidate.statisticsEligibility = { eligible: false, reasons: ['FX_MISSING'] };
    const view = await mountJournal(<JournalFactSummary candidate={candidate} />);
    expect(view.host.textContent).toContain('历史快照已过期');
    expect(view.host.textContent).toContain('不进入本粒度默认统计');
    expect(view.host.textContent).not.toContain('符合本粒度统计资格');
  });
  it('加载、空态与失败区分；重试不保留错误，旧记录不成为正式候选', async () => {
    const pending = journalDeferred<ReturnType<typeof page>>();
    api.candidates.mockReturnValueOnce(pending.promise);
    const view = await mountJournal(<JournalCandidateBrowser {...props} />);
    expect(view.host.textContent).not.toContain('没有可复盘对象');
    pending.resolve({ ...page(), items: [] });
    await journalWait(() => expect(view.host.textContent).toContain('没有可复盘对象'));
    api.candidates.mockRejectedValueOnce(new Error('网络中断'));
    await view.client.refetchQueries({ queryKey: ['journal-review-candidates'] });
    await journalWait(() => expect(view.host.textContent).toContain('候选读取失败'));
    const legacy = browserJournalLegacy(accountId, 'actual');
    api.candidates.mockResolvedValueOnce({ ...page(), items: [], legacyItems: [legacy] });
    await journalClick('重新读取');
    await journalWait(() => expect(view.host.textContent).toContain('旧 Journal 记录待确认（1）'));
    expect(view.host.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(view.host.textContent).not.toContain('候选读取失败');
  });
  it('游标过期后重试从第一页读取，未重复提交旧游标', async () => {
    api.candidates.mockResolvedValueOnce({ ...page(), nextCursor: 'old-generation-cursor' });
    const view = await mountJournal(<JournalCandidateBrowser {...props} />);
    await journalWait(() => expect(journalButton('读取下一页').disabled).toBe(false));
    api.candidates.mockRejectedValueOnce(new Error('投影世代已变化'));
    await journalClick('读取下一页');
    await journalWait(() => expect(view.host.textContent).toContain('候选读取失败'));
    expect(api.candidates.mock.calls[1]![0].cursor).toBe('old-generation-cursor');
    await journalClick('重新读取');
    await journalWait(() => expect(view.host.textContent).not.toContain('候选读取失败'));
    expect(api.candidates.mock.calls[2]![0]).not.toHaveProperty('cursor');
  });
  it('非法窗口不提交，合法窗口变更清除单笔选择且不携带旧游标', async () => {
    await mountJournal(<JournalCandidateBrowser {...props} />);
    await journalWait(() => expect(api.candidates).toHaveBeenCalledTimes(1));
    await journalFill('候选开始时间', '2026-01-04T00:00:00Z');
    await journalFill('候选结束时间', '2026-01-03T00:00:00Z');
    await journalClick('应用候选窗口');
    expect(document.body.textContent).toContain('候选窗口无效');
    expect(api.candidates).toHaveBeenCalledTimes(1);
    await journalFill('候选结束时间', '2026-01-05T00:00:00Z');
    await journalClick('应用候选窗口');
    await journalWait(() => expect(api.candidates).toHaveBeenCalledTimes(2));
    expect(props.onWindowApplied).toHaveBeenCalledTimes(1);
    expect(api.candidates.mock.calls[1]![0]).toMatchObject({
      accountId,
      mode: 'actual',
      start: '2026-01-04T00:00:00Z',
      end: '2026-01-05T00:00:00Z',
    });
    expect(api.candidates.mock.calls[1]![0]).not.toHaveProperty('cursor');
  });
  it('账户模式切换后的晚候选响应不能污染新工作台', async () => {
    const late = journalDeferred<ReturnType<typeof page>>();
    api.candidates.mockReturnValueOnce(late.promise);
    const first = {
      id: accountId,
      name: '实际账户',
      type: 'securities' as const,
      mode: 'actual' as const,
      currency: 'USD' as const,
    };
    const second = {
      ...first,
      id: '00000000-0000-4000-8000-000000000088',
      name: '影子账户',
      mode: 'shadow' as const,
    };
    const view = await mountJournal(
      <JournalReviewWorkspace
        accounts={[first, second]}
        search={`?accountId=${first.id}&mode=actual`}
      />,
    );
    api.candidates.mockResolvedValueOnce({ ...page(), items: [] });
    await view.render(
      <JournalReviewWorkspace
        accounts={[first, second]}
        search={`?accountId=${second.id}&mode=shadow`}
      />,
    );
    late.resolve(page());
    await journalWait(() => expect(view.host.textContent).toContain('没有可复盘对象'));
    expect(view.host.textContent).not.toContain('AAPL.US');
    expect(api.candidates.mock.calls.at(-1)![0]).toMatchObject({
      accountId: second.id,
      mode: 'shadow',
    });
    expect(api.history.mock.calls.at(-1)![0]).toMatchObject({
      accountId: second.id,
      mode: 'shadow',
    });
  });
});
