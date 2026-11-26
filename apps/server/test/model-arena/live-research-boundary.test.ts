import { describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveResearchRunner } from '../../src/model-arena/live/live-research-runner.js';
import { liveProtocolFixture } from './live-fixture.js';

vi.mock('../../src/model-arena/live/live-research-control.js', () => ({
  LiveResearchControl: class {
    signal = new AbortController().signal;
    start = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
  },
}));

const toolStep = { action: 'tools', requests: [{ name: 'quote', symbol: '588000.SH' }] };
const decision = {
  action: 'decision',
  decision: {
    summary: '观望',
    orders: [],
    cancelOrderIds: [],
    watchedSymbols: ['588000.SH'],
    wakeups: [{ kind: 'time', at: '2026-11-03T02:00:00Z' }],
  },
};
function fixture() {
  const protocol = liveProtocolFixture({ allowWebSearch: true });
  const account = arenaLiveAccountSchema.parse({
    revision: 0,
    cash: '10000',
    positions: [],
    cashSettlements: [],
    orders: [],
    wakeups: [],
    watchedSymbols: [],
    fills: [],
  });
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: 'cycle',
        state: 'running',
        attempt: 1,
        deadlineAt: null,
        input: { protocol, account, asOf: '2026-11-03T01:31:00Z', replay: true },
      },
    ]),
  };
  const messages: { role: string; content: string }[][] = [];
  const answers: unknown[] = [toolStep, decision];
  const call = {
    generate: vi.fn(async (_id, _attempt, input) => {
      messages.push(structuredClone(input));
      return answers.shift();
    }),
  };
  const tools = { execute: vi.fn() };
  const budget = { reserve: vi.fn(), settle: vi.fn(), tool: vi.fn(), fail: vi.fn() };
  const orders = { submit: vi.fn() };
  const runner = new LiveResearchRunner(
    db as never,
    call as never,
    tools as never,
    budget as never,
    orders as never,
  );
  return { runner, call, tools, budget, orders, messages, answers };
}

describe('工具请求与后续回复的等待边界', () => {
  it.each(['ready', 'unavailable'] as const)(
    '工具完成为 %s 前不发起下一次生成或提交决策，完成后交回结果',
    async (status) => {
      const f = fixture();
      let finish!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      f.tools.execute.mockImplementation(async () => {
        started();
        await pending;
        if (status === 'unavailable') throw new Error('受控资料不可用');
        return { price: '1.1', asOf: '2026-11-03T01:31:00Z' };
      });
      const running = f.runner.execute('cycle', 1);
      await waiting;
      expect(f.call.generate).toHaveBeenCalledTimes(1);
      expect(f.orders.submit).not.toHaveBeenCalled();
      expect(f.budget.settle).not.toHaveBeenCalled();
      finish();
      await running;
      expect(f.call.generate).toHaveBeenCalledTimes(2);
      expect(f.tools.execute).toHaveBeenCalledTimes(1);
      const nextMessages = f.messages[1]!;
      expect(JSON.parse(nextMessages.at(-2)!.content)).toEqual(toolStep);
      expect(JSON.parse(nextMessages.at(-1)!.content)).toMatchObject({
        toolResults: [{ request: toolStep.requests[0], outcome: { status } }],
        observedAt: '2026-11-03T01:31:00Z',
      });
      expect(f.orders.submit).toHaveBeenCalledWith('cycle', 1, decision.decision);
      expect(f.budget.fail).not.toHaveBeenCalled();
    },
  );

  it.each([
    { action: 'tools', requests: [{ name: 'financials', symbol: '588000.SH' }] },
    { action: 'tools', requests: [{ name: 'web_search', query: '观察' }] },
    {
      action: 'tools',
      requests: [{ name: 'bars', symbol: '588000.SH', timeframe: '1d', limit: 5 }],
    },
    { ...toolStep, decision: decision.decision },
  ])('越界或混合回复在工具执行和决策提交前拒绝：%j', async (answer) => {
    const f = fixture();
    f.answers.splice(0, f.answers.length, answer);
    await f.runner.execute('cycle', 1);
    expect(f.call.generate).toHaveBeenCalledTimes(1);
    expect(f.tools.execute).not.toHaveBeenCalled();
    expect(f.orders.submit).not.toHaveBeenCalled();
    expect(f.budget.reserve).not.toHaveBeenCalled();
    expect(f.budget.fail).toHaveBeenCalledOnce();
  });
});
