// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalAiRunPanel } from '../src/features/journal/review/JournalAiRunPanel.js';
import { JournalAiExplanation } from '../src/features/journal/review/JournalAiExplanation.js';
import { journalAiReferenceKey } from '../src/features/journal/review/journal-ai-reference.js';
import {
  journalClick,
  journalButton,
  journalDeferred,
  journalWait,
  mountJournal,
} from './journal-mounted-harness.js';

const api = vi.hoisted(() => ({ explain: vi.fn(), explanation: vi.fn() }));
vi.mock('../src/shared/api/client', () => ({
  getDesktopApiClient: () => ({ journalReviews: api }),
}));

const run = {
  id: '00000000-0000-4000-8000-000000000099',
  provider: '验收 Provider',
  model: '验收模型',
  promptVersion: '验收-v2',
  algorithmVersion: 'journal-test',
  status: 'succeeded' as const,
  errorSummary: null,
  result: {
    version: 1 as const,
    provider: '验收 Provider',
    conclusion: '只解读已核对的事实',
    evidence: [
      {
        claim: '实际成交独立可追溯',
        citations: [{ sourceId: 'source:1', toolCallId: 'getJournalReview:1' }],
      },
    ],
    risks: ['止损路径未知'],
    unknowns: ['没有行情路径'],
    disclaimer: '验收说明',
    createdAt: '2026-10-05T00:00:00Z',
  },
};

describe('AI 任务引用恢复交互', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });
  const props = () => ({
    accountId: '账户一',
    mode: 'actual',
    kind: 'object' as const,
    scope: { object: 'cycle:1', fingerprint: 'facts:1', draft: {} },
    disabled: false,
    createRun: vi.fn(async () => run),
    readRun: vi.fn(async () => run),
    onRunSelected: vi.fn(),
  });
  it('重新挂载只读取同一任务，引用中不保存事实和报告', async () => {
    const p = props();
    const first = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(first.host.textContent).toContain('getJournalReview:1'));
    expect(p.createRun).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(2);
    const key = await journalAiReferenceKey(JSON.stringify([p.kind, p.accountId, p.mode, p.scope]));
    const stored = sessionStorage.getItem(key);
    expect(JSON.parse(stored!)).toEqual({ version: 1, id: run.id });
    await first.dispose();
    const second = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(second.host.textContent).toContain('只解读已核对的事实'));
    expect(p.createRun).toHaveBeenCalledTimes(1);
    expect(p.readRun).toHaveBeenCalledTimes(2);
    expect(p.onRunSelected).toHaveBeenCalledWith(run.id);
    expect(journalButton('开始 AI 解读').disabled).toBe(true);
  });
  it.each([
    { accountId: '账户二' },
    { mode: 'shadow' },
    { kind: 'period' as const },
    { scope: { object: 'cycle:2', fingerprint: 'facts:1', draft: {} } },
    { scope: { object: 'cycle:1', fingerprint: 'facts:2', draft: {} } },
    { scope: { object: 'cycle:1', fingerprint: 'facts:1', draft: { plannedExit: '13' } } },
  ])('账户、模式、粒度、对象、证据或草稿变化时隔离旧引用：%j', async (change) => {
    const p = props();
    const view = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain(run.id));
    const reads = p.readRun.mock.calls.length;
    await view.render(<JournalAiRunPanel {...p} {...change} />);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    expect(view.host.textContent).not.toContain(run.id);
    expect(p.readRun).toHaveBeenCalledTimes(reads);
    expect(p.createRun).toHaveBeenCalledTimes(1);
  });
  it('读取失败可局部重试或清除，不自动创建新任务', async () => {
    const p = props();
    const view = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain(run.id));
    await view.dispose();
    p.readRun.mockRejectedValueOnce(new Error('网络中断'));
    const restored = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(restored.host.textContent).toContain('AI 状态读取失败'));
    expect(p.createRun).toHaveBeenCalledTimes(1);
    await journalClick('重新读取');
    await journalWait(() => expect(restored.host.textContent).toContain('验收-v2'));
    await journalClick('清除任务引用');
    const key = await journalAiReferenceKey(JSON.stringify([p.kind, p.accountId, p.mode, p.scope]));
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(restored.host.textContent).not.toContain('只解读已核对的事实');
    expect(p.onRunSelected).toHaveBeenLastCalledWith(null);
    expect(p.createRun).toHaveBeenCalledTimes(1);
  });
  it('损坏引用在读取阶段清理；生成失败不会留下待恢复引用', async () => {
    const p = props();
    const key = await journalAiReferenceKey(JSON.stringify([p.kind, p.accountId, p.mode, p.scope]));
    sessionStorage.setItem(key, '{broken');
    p.createRun.mockRejectedValueOnce(new Error('默认模型不可用'));
    const view = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    expect(sessionStorage.length).toBe(0);
    expect(p.readRun).not.toHaveBeenCalled();
    await journalClick('开始 AI 解读');
    await journalWait(() => expect(view.host.textContent).toContain('AI 解读未提交'));
    expect(sessionStorage.length).toBe(0);
    expect(journalButton('开始 AI 解读').disabled).toBe(false);
  });
  it('旧账户的晚生成响应不会在新账户展示或开启自动读取', async () => {
    const p = props();
    const late = journalDeferred<typeof run>();
    p.createRun.mockReturnValueOnce(late.promise);
    const view = await mountJournal(<JournalAiRunPanel {...p} />);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    await journalClick('开始 AI 解读');
    await view.render(<JournalAiRunPanel {...p} accountId="账户二" />);
    late.resolve(run);
    await journalWait(() => expect(journalButton('开始 AI 解读').disabled).toBe(false));
    expect(view.host.textContent).not.toContain(run.id);
    expect(p.readRun).not.toHaveBeenCalled();
  });
  it.each([
    { reviewObjectId: 'TRADE_CYCLE:other' },
    { evidenceFingerprint: 'other-facts' },
    { algorithmVersion: 'other-algorithm' },
    { mode: 'shadow' },
    { accountId: '00000000-0000-4000-8000-000000000088' },
    { analysisDraft: { plannedExit: '13' } },
  ])('恢复引用内容与冻结输入不一致时局部拒绝，不展示错误报告：%j', async (change) => {
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
    const key = await journalAiReferenceKey(
      JSON.stringify(['object', request.accountId, request.mode, request]),
    );
    sessionStorage.setItem(key, JSON.stringify({ version: 1, id: run.id }));
    api.explanation.mockResolvedValueOnce({
      ...run,
      accountId: request.accountId,
      mode: request.mode,
      reviewObjectId: request.reference.reviewObjectId,
      evidenceFingerprint: request.evidenceFingerprint,
      analysisDraft: request.analysisDraft,
      ...change,
    });
    const view = await mountJournal(
      <JournalAiExplanation request={request} disabled={false} onRunSelected={vi.fn()} />,
    );
    await journalWait(() => expect(view.host.textContent).toContain('AI 状态读取失败'));
    expect(view.host.textContent).toContain('与本次输入不一致');
    expect(view.host.textContent).not.toContain('只解读已核对的事实');
    expect(api.explain).not.toHaveBeenCalled();
    expect(api.explanation).toHaveBeenCalledTimes(1);
  });
});
