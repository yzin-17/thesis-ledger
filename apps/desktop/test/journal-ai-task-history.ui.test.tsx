// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAnalyze } from '@thesis-ledger/domain';
import {
  journalDeterministicReviewSchema,
  journalReviewSnapshotContractSchema,
} from '@thesis-ledger/schemas';
import { JournalAiRunPanel } from '../src/features/journal/review/JournalAiRunPanel.js';
import { JournalSavedAiExplanation } from '../src/features/journal/review/JournalSavedAiExplanation.js';
import {
  journalClick,
  journalWait,
  journalMountedCandidate,
  mountJournal,
} from './journal-mounted-harness.js';
import { journalSessionRun as run } from './journal-ai-session.fixture.js';

const api = vi.hoisted(() => ({ explanation: vi.fn(), explain: vi.fn() }));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
function savedSnapshot() {
  const candidate = journalMountedCandidate();
  const result = journalDeterministicReviewSchema.parse(journalAnalyze(candidate));
  return journalReviewSnapshotContractSchema.parse({
    id: '00000000-0000-4000-8000-000000000098',
    inputSnapshot: candidate.input,
    outputSnapshot: {
      ...result,
      aiExplanation: {
        id: run.id,
        provider: run.provider,
        model: run.model,
        promptVersion: run.promptVersion,
        status: run.status,
      },
    },
    status: 'CURRENT',
    createdAt: '2026-10-05T00:00:00Z',
  });
}
describe('保存复盘快照后的 AI 解读读取', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });
  it.each(['object', 'period'] as const)('未保存的%s会话不会在重新挂载时恢复任务', async (kind) => {
    const create = vi.fn(async () => run),
      read = vi.fn(async () => run);
    const first = await mountJournal(
      <JournalAiRunPanel
        accountId="账户一"
        mode="actual"
        kind={kind}
        disabled={false}
        createRun={create}
        readRun={read}
      />,
    );
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(first.host.textContent).toContain(run.id));
    await first.dispose();
    const next = await mountJournal(
      <JournalAiRunPanel
        accountId="账户一"
        mode="actual"
        kind={kind}
        disabled={false}
        createRun={create}
        readRun={read}
      />,
    );
    expect(next.host.textContent).not.toContain(run.id);
    expect(next.host.textContent).toContain('开始 AI 解读');
    expect(create).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(sessionStorage.length).toBe(0);
  });
  it('保存的快照按任务 ID 读取，刷新与账户模式切换不生成新任务', async () => {
    const snapshot = savedSnapshot();
    api.explanation.mockResolvedValue({
      ...run,
      reviewObjectId: snapshot.inputSnapshot.reference.reviewObjectId,
      evidenceFingerprint: snapshot.inputSnapshot.projection.evidenceFingerprint,
      algorithmVersion: snapshot.outputSnapshot.algorithmVersion,
      analysisDraft: snapshot.inputSnapshot.analysisDraft,
    });
    const first = await mountJournal(
      <JournalSavedAiExplanation snapshot={snapshot} accountId="账户一" mode="actual" />,
    );
    await journalWait(() => expect(first.host.textContent).toContain('只解读已核对的事实'));
    expect(first.host.querySelectorAll('section[aria-label="保存时的 AI 解读"]')).toHaveLength(1);
    await first.dispose();
    const next = await mountJournal(
      <JournalSavedAiExplanation snapshot={snapshot} accountId="账户一" mode="actual" />,
    );
    await journalWait(() => expect(api.explanation).toHaveBeenCalledTimes(2));
    expect(api.explanation.mock.calls[1]?.slice(0, 2)).toEqual([
      run.id,
      { accountId: '账户一', mode: 'actual' },
    ]);
    api.explanation.mockRejectedValueOnce(new Error('账户范围不可用'));
    await next.render(
      <JournalSavedAiExplanation snapshot={snapshot} accountId="账户一" mode="shadow" />,
    );
    await journalWait(() => expect(next.host.textContent).toContain('保存的 AI 解读读取失败'));
    expect(next.host.textContent).not.toContain('只解读已核对的事实');
    expect(api.explain).not.toHaveBeenCalled();
  });
  it('保存任务读取失败只能重读，保留快照引用且不重新生成', async () => {
    const snapshot = savedSnapshot();
    api.explanation.mockRejectedValue(new Error('引用不可用'));
    const view = await mountJournal(
      <JournalSavedAiExplanation snapshot={snapshot} accountId="账户一" mode="actual" />,
    );
    await journalWait(() => expect(view.host.textContent).toContain('保存的 AI 解读读取失败'));
    await journalClick('重新读取');
    await journalWait(() => expect(api.explanation).toHaveBeenCalledTimes(2));
    expect(snapshot.outputSnapshot.aiExplanation?.id).toBe(run.id);
    expect(view.host.textContent).not.toContain('开始 AI 解读');
    expect(api.explain).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'other-task' },
    { reviewObjectId: 'other-object' },
    { evidenceFingerprint: 'other-facts' },
    { algorithmVersion: 'other-version' },
    { analysisDraft: { plannedExit: '13' } },
  ])('保存时的任务、对象、证据、算法或草稿不一致时拒绝展示：%j', async (change) => {
    const snapshot = savedSnapshot();
    api.explanation.mockResolvedValue({
      ...run,
      reviewObjectId: snapshot.inputSnapshot.reference.reviewObjectId,
      evidenceFingerprint: snapshot.inputSnapshot.projection.evidenceFingerprint,
      algorithmVersion: snapshot.outputSnapshot.algorithmVersion,
      analysisDraft: snapshot.inputSnapshot.analysisDraft,
      ...change,
    });
    const view = await mountJournal(
      <JournalSavedAiExplanation snapshot={snapshot} accountId="账户一" mode="actual" />,
    );
    await journalWait(() => expect(view.host.textContent).toContain('与保存时的复盘证据不一致'));
    expect(view.host.textContent).not.toContain('只解读已核对的事实');
    expect(api.explain).not.toHaveBeenCalled();
  });
});
