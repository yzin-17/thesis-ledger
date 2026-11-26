// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalAiRunPanel } from '../src/features/journal/review/JournalAiRunPanel.js';
import { JournalAiExplanation } from '../src/features/journal/review/JournalAiExplanation.js';
import {
  journalClick,
  journalButton,
  journalDeferred,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';
import { journalSessionRun as run } from './journal-ai-session.fixture.js';

const api = vi.hoisted(() => ({ explain: vi.fn(), explanation: vi.fn() }));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));
const props = () => ({
  accountId: '账户一',
  mode: 'actual',
  kind: 'object' as const,
  disabled: false,
  createRun: vi.fn(async () => run),
  readRun: vi.fn(async () => run),
  onRunSelected: vi.fn(),
});
describe('当前复盘会话的 AI 任务恢复', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each([{}, { subtle: { digest: vi.fn().mockRejectedValue(new Error('blocked')) } }])(
    '没有可用 WebCrypto 时仍可显式启动，任务和报告不写入浏览器存储：%j',
    async (crypto) => {
      vi.stubGlobal('crypto', crypto);
      const p = props();
      const view = await mountJournal(<JournalAiRunPanel {...p} />);
      expect(p.createRun).not.toHaveBeenCalled();
      expect(p.readRun).not.toHaveBeenCalled();
      await journalClick('开始 AI 解读');
      await journalWait(() => expect(view.host.textContent).toContain('只解读已核对的事实'));
      expect(p.createRun).toHaveBeenCalledOnce();
      expect(p.readRun).toHaveBeenCalledOnce();
      expect(sessionStorage.length).toBe(0);
    },
  );
  it('重新挂载不恢复未保存的旧任务，也不自动创建解读', async () => {
    const p = props();
    const first = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(first.host.textContent).toContain(run.result.evidenceBindings[0]!.toolCallId));
    await first.dispose();
    sessionStorage.setItem('journal-review-ai:v1:old', JSON.stringify({ version: 1, id: run.id }));
    const second = await mountJournal(<JournalAiRunPanel {...p} />);
    expect(journalButton('开始 AI 解读').disabled).toBe(false);
    expect(second.host.textContent).not.toContain(run.id);
    expect(p.createRun).toHaveBeenCalledOnce();
    expect(p.readRun).toHaveBeenCalledOnce();
    expect(p.onRunSelected).toHaveBeenCalledWith(run.id);
  });
  it('状态读取失败可局部重试，不创建第二个任务或绑定失败结果', async () => {
    const p = props();
    p.readRun.mockRejectedValueOnce(new Error('网络中断'));
    const view = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain('AI 状态读取失败'));
    expect(p.onRunSelected).not.toHaveBeenCalled();
    await journalClick('重新读取');
    await journalWait(() => expect(view.host.textContent).not.toContain('AI 状态读取失败'));
    expect(p.createRun).toHaveBeenCalledOnce();
    expect(p.readRun).toHaveBeenCalledTimes(2);
    expect(p.onRunSelected).toHaveBeenCalledWith(run.id);
    expect(sessionStorage.length).toBe(0);
  });
  it('提交失败可显式重试，不留下浏览器任务绑定', async () => {
    const p = props();
    p.createRun.mockRejectedValueOnce(new Error('默认模型不可用'));
    const view = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain('AI 解读未提交'));
    expect(sessionStorage.length).toBe(0);
    expect(p.readRun).not.toHaveBeenCalled();
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain(run.id));
    expect(p.createRun).toHaveBeenCalledTimes(2);
    expect(sessionStorage.length).toBe(0);
  });
  it.each(['账户', '模式', '粒度', '对象', '证据', '草稿'])(
    '上层切换%s会话后旧创建响应不回填或启动读取',
    async (change) => {
      const p = props();
      const late = journalDeferred<typeof run>();
      p.createRun.mockReturnValueOnce(late.promise);
      const view = await mountJournal(<JournalAiRunPanel key="原会话" {...p} />);
      await journalClick('开始 AI 解读');
      await view.render(
        <JournalAiRunPanel
          key={change}
          {...p}
          accountId={change === '账户' ? '账户二' : p.accountId}
          mode={change === '模式' ? 'shadow' : p.mode}
          kind={change === '粒度' ? 'period' : p.kind}
        />,
      );
      late.resolve(run);
      await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
      expect(view.host.textContent).not.toContain(run.id);
      expect(p.readRun).not.toHaveBeenCalled();
      expect(p.createRun).toHaveBeenCalledOnce();
      expect(p.onRunSelected).not.toHaveBeenCalled();
    },
  );
  it.each([
    { reviewObjectId: 'TRADE_CYCLE:other' },
    { evidenceFingerprint: 'other-facts' },
    { algorithmVersion: 'other-algorithm' },
    { mode: 'shadow' },
    { accountId: '00000000-0000-4000-8000-000000000088' },
    { analysisDraft: { plannedExit: '13' } },
  ])('读取结果与冻结输入不一致时拒绝报告，不绑定到快照：%j', async (change) => {
    const request = {
      accountId: '00000000-0000-4000-8000-000000000001',
      mode: 'actual' as const,
      reference: {
        reviewObjectType: 'TRADE_CYCLE' as const,
        reviewObjectId: 'TRADE_CYCLE:trade-1',
        tradeId: 'trade-1',
      },
      evidenceFingerprint: 'facts:1',
      analysisDraft: {},
      expectedAlgorithmVersion: run.algorithmVersion,
    };
    api.explain.mockResolvedValueOnce({ ...run, status: 'queued', result: null });
    api.explanation.mockResolvedValueOnce({
      ...run,
      accountId: request.accountId,
      mode: request.mode,
      reviewObjectId: request.reference.reviewObjectId,
      evidenceFingerprint: request.evidenceFingerprint,
      analysisDraft: request.analysisDraft,
      ...change,
    });
    const selected = vi.fn();
    const view = await mountJournal(
      <JournalAiExplanation request={request} disabled={false} onRunSelected={selected} />,
    );
    expect(api.explain).not.toHaveBeenCalled();
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain('AI 状态读取失败'));
    expect(view.host.textContent).toContain('与复盘输入不一致');
    expect(view.host.textContent).not.toContain('只解读已核对的事实');
    expect(api.explain).toHaveBeenCalledOnce();
    expect(api.explanation).toHaveBeenCalledOnce();
    expect(selected).not.toHaveBeenCalled();
  });
});
