import { expect, it, vi } from 'vitest';
import { LiveResearchRunner } from '../../src/model-arena/live/live-research-runner.js';
import { liveProtocolFixture } from './live-fixture.js';
import type { arenaLiveResearchStepSchema } from '@thesis-ledger/schemas';
import { ArenaSellAvailabilityError } from '@thesis-ledger/domain';
import { LiveInvalidDecisionError } from '../../src/model-arena/live/live-invalid-decision.js';

function setup(maxResearchSteps: number | null = null, replay = false) {
  const protocol = liveProtocolFixture();
  protocol.resources.maxResearchSteps = maxResearchSteps;
  const asOf = '2026-11-12T16:00:00.000Z';
  const account = {
    revision: 0,
    cash: '100000',
    positions: [],
    cashSettlements: [],
    orders: [],
    wakeups: [],
    watchedSymbols: [],
    fills: [],
  };
  const cycle = {
    state: 'running',
    attempt: 1,
    deadlineAt: null,
    input: { protocol, account, asOf, replay },
  };
  const db = {
    $queryRaw: vi.fn(async (query: TemplateStringsArray) =>
      query.join('').includes('SELECT *') ? [cycle] : [{ id: 'cycle' }],
    ),
  };
  const snapshots: { role: string; content: string }[][] = [];
  const answer: ReturnType<typeof arenaLiveResearchStepSchema.parse> = {
    action: 'decision',
    decision: {
      summary: '观察',
      orders: [],
      cancelOrderIds: [],
      watchedSymbols: [],
      wakeups: [{ kind: 'time', at: '2026-11-13T16:00:00.000Z' }],
    },
  };
  const call = {
    generate: vi.fn(
      async (
        _id: string,
        _attempt: number,
        messages: { role: string; content: string }[],
      ): Promise<ReturnType<typeof arenaLiveResearchStepSchema.parse>> => {
        snapshots.push(structuredClone(messages));
        return answer;
      },
    ),
  };
  const orders = { submit: vi.fn().mockResolvedValue({}) },
    budget = {
      fail: vi.fn(),
      reserve: vi.fn(),
      settle: vi.fn(),
      tool: vi.fn(),
    };
  const tools = { execute: vi.fn() };
  const runner = new LiveResearchRunner(
    db as never,
    call as never,
    tools as never,
    budget as never,
    orders as never,
  );
  return { runner, call, orders, budget, tools, snapshots, asOf };
}

it.each([false, true])('工具先预留再执行和结算，下一步保留结果，历史回放=%s', async (replay) => {
  const s = setup(null, replay);
  const sequence: string[] = [];
  s.call.generate.mockResolvedValueOnce({
    action: 'tools',
    requests: [{ name: 'quote', symbol: 'AAPL.US' }],
  });
  s.budget.reserve.mockImplementation(async () => {
    sequence.push('reserve');
  });
  s.tools.execute.mockImplementation(async () => {
    sequence.push('execute');
    return { price: '10' };
  });
  s.budget.settle.mockImplementation(async () => {
    sequence.push('settle');
  });
  s.budget.tool.mockImplementation(async () => {
    sequence.push('audit');
  });
  await s.runner.execute('cycle', 1);
  expect(sequence).toEqual(['reserve', 'execute', 'settle', 'audit']);
  const requestId = s.budget.reserve.mock.calls[0]![2];
  expect(s.budget.settle).toHaveBeenCalledWith(
    'cycle',
    requestId,
    { requests: 1, tokens: 0, costMicros: 0 },
    { kind: 'research_tool', outcome: { status: 'ready', data: { price: '10' } } },
  );
  expect(s.tools.execute.mock.calls[0]![3]).toBe(replay ? s.asOf : undefined);
  expect(JSON.parse(s.snapshots[0]!.at(-1)!.content).toolResults[0].outcome).toEqual({
    status: 'ready',
    data: { price: '10' },
  });
  expect(s.orders.submit).toHaveBeenCalledOnce();
  expect(s.budget.fail).not.toHaveBeenCalled();
});

it('工具预留被拒绝后不执行、不结算，也不请求下一步', async () => {
  const s = setup();
  s.call.generate.mockResolvedValueOnce({
    action: 'tools',
    requests: [{ name: 'quote', symbol: 'AAPL.US' }],
  });
  s.budget.reserve.mockRejectedValueOnce(new Error('participant_budget'));
  await s.runner.execute('cycle', 1);
  expect(s.tools.execute).not.toHaveBeenCalled();
  expect(s.budget.settle).not.toHaveBeenCalled();
  expect(s.call.generate).toHaveBeenCalledOnce();
  expect(s.budget.fail).toHaveBeenCalledWith(
    'cycle',
    1,
    'participant_budget',
    'participant_budget',
  );
});
it('执行证据拒绝后由模型重新决策，并保留校验反馈与原提交入口', async () => {
  const s = setup();
  s.orders.submit.mockRejectedValueOnce(new Error('execution_evidence_missing'));
  await s.runner.execute('cycle', 1);
  expect(s.call.generate).toHaveBeenCalledTimes(2);
  expect(s.orders.submit).toHaveBeenCalledTimes(2);
  const feedback = JSON.parse(s.snapshots[1]!.at(-1)!.content);
  expect(feedback.decisionRejected).toMatchObject({
    code: 'execution_evidence_missing',
    accountChanged: false,
  });
  expect(feedback.instruction).toContain('限价委托也不能绕过');
  expect(s.budget.fail).not.toHaveBeenCalled();
});
it('重复拒绝最多修正一次，保留原失败码且不会无限调用', async () => {
  const s = setup();
  s.orders.submit.mockRejectedValue(new Error('execution_evidence_missing'));
  await s.runner.execute('cycle', 1);
  expect(s.call.generate).toHaveBeenCalledTimes(2);
  expect(s.orders.submit).toHaveBeenCalledTimes(2);
  expect(s.budget.fail).toHaveBeenCalledWith(
    'cycle',
    1,
    'execution_evidence_missing',
    'execution_evidence_missing',
  );
});
it('有限步骤和账户冲突不因反馈而放宽', async () => {
  const bounded = setup(1);
  bounded.orders.submit.mockRejectedValue(new Error('execution_evidence_missing'));
  await bounded.runner.execute('cycle', 1);
  expect(bounded.call.generate).toHaveBeenCalledOnce();
  expect(bounded.budget.fail).toHaveBeenCalledWith(
    'cycle',
    1,
    'execution_evidence_missing',
    'execution_evidence_missing',
  );
  const conflict = setup();
  conflict.orders.submit.mockRejectedValue(new Error('account_conflict'));
  await conflict.runner.execute('cycle', 1);
  expect(conflict.call.generate).toHaveBeenCalledOnce();
  expect(conflict.budget.fail).toHaveBeenCalledWith(
    'cycle',
    1,
    'account_conflict',
    'account_conflict',
  );
});
it('未知用量不重发，历史反馈使用冻结时刻', async () => {
  const unknown = setup();
  unknown.call.generate.mockRejectedValueOnce(new Error('unknown_usage'));
  await unknown.runner.execute('cycle', 1);
  expect(unknown.call.generate).toHaveBeenCalledOnce();
  expect(unknown.orders.submit).not.toHaveBeenCalled();
  const replay = setup(null, true);
  replay.orders.submit.mockRejectedValueOnce(new Error('execution_evidence_missing'));
  await replay.runner.execute('cycle', 1);
  expect(JSON.parse(replay.snapshots[1]!.at(-1)!.content).decisionRejected.observedAt).toBe(
    replay.asOf,
  );
});

const invalid = () => new LiveInvalidDecisionError('{"action":"decision","decision":{"orders":[]}}',
  [{ path: ['decision', 'orders', 0, 'onFill'], message: '成交保护只能附属于买入父单' }]);
const unsettled = () => new ArenaSellAvailabilityError({ symbol: '510300.SH', tradingDate: '2026-11-02',
  totalQuantity: '5000', settledQuantity: '0', unsettledQuantity: '5000', reservedQuantity: '0', availableQuantity: '0',
  activeSellOrderIds: [], settlements: [{ availableOn: '2026-11-03', quantity: '5000' }] }, '5000');
it('完整 Schema 拒绝保留原助手回复，反馈后只允许一次完整修正', async () => {
  const s = setup(null, true), error = invalid();
  s.call.generate.mockRejectedValueOnce(error);
  await s.runner.execute('cycle', 1);
  expect(s.call.generate).toHaveBeenCalledTimes(2);
  expect(s.orders.submit).toHaveBeenCalledOnce();
  expect(s.snapshots[0]!.at(-2)).toEqual({ role: 'assistant', content: error.reply });
  expect(JSON.parse(s.snapshots[0]!.at(-1)!.content).decisionRejected).toMatchObject({ code: 'schema_invalid', observedAt: s.asOf });
  expect(s.budget.fail).not.toHaveBeenCalled();
});
it('T+1 原子拒绝可反馈，Schema 与业务拒绝共享一次额度', async () => {
  const s = setup(null, true);
  s.orders.submit.mockRejectedValueOnce(unsettled());
  await s.runner.execute('cycle', 1);
  expect(s.call.generate).toHaveBeenCalledTimes(2);
  expect(JSON.parse(s.snapshots[1]!.at(-1)!.content).decisionRejected).toMatchObject({ reason: 'position_not_settled',
    sellAvailability: { availableQuantity: '0' } });
  const combined = setup(null, true);
  combined.call.generate.mockRejectedValueOnce(invalid());
  combined.orders.submit.mockRejectedValueOnce(unsettled());
  await combined.runner.execute('cycle', 1);
  expect(combined.call.generate).toHaveBeenCalledTimes(2);
  expect(combined.orders.submit).toHaveBeenCalledOnce();
  expect(combined.budget.fail).toHaveBeenCalledWith('cycle', 1, 'insufficient_position', 'insufficient_position');
});
it('有限步骤、重复 Schema 拒绝、截断及未知结果不追加生成', async () => {
  const bounded = setup(1);
  bounded.call.generate.mockRejectedValueOnce(invalid());
  await bounded.runner.execute('cycle', 1);
  expect(bounded.call.generate).toHaveBeenCalledOnce();
  const repeated = setup(); repeated.call.generate.mockRejectedValue(invalid());
  await repeated.runner.execute('cycle', 1);
  expect(repeated.call.generate).toHaveBeenCalledTimes(2);
  expect(repeated.orders.submit).not.toHaveBeenCalled();
  for (const code of ['model_output_invalid', 'unknown_usage', 'cycle_not_active', 'model_identity_unverified']) {
    const failed = setup(); failed.call.generate.mockRejectedValueOnce(new Error(code));
    await failed.runner.execute('cycle', 1);
    expect(failed.call.generate).toHaveBeenCalledOnce();
    expect(failed.orders.submit).not.toHaveBeenCalled();
  }
});
