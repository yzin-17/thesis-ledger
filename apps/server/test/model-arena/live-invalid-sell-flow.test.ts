import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema, arenaLiveProtocolSchema } from '@thesis-ledger/schemas';
import type { ArenaPaperContext } from '@thesis-ledger/domain';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { LiveResearchCall } from '../../src/model-arena/live/live-research-call.js';
import { LiveResearchRunner } from '../../src/model-arena/live/live-research-runner.js';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import type * as Storage from '../../src/model-arena/live/live-storage.js';

const mocks = vi.hoisted(() => ({ match: vi.fn(), agents: vi.fn(), save: vi.fn(), prepare: vi.fn() }));
vi.mock('../../src/model-arena/live/live-storage.js', async original => ({
  ...await original<typeof Storage>(), liveMatch: mocks.match, liveAgents: mocks.agents, saveLiveAccount: mocks.save,
}));
vi.mock('../../src/ai/ai-model-receipt.js', () => ({ prepareModelReceipt: mocks.prepare }));
const sample = JSON.parse(readFileSync(new URL('./fixtures/invalid-sell-20261102.json', import.meta.url), 'utf8'));
vi.mock('../../src/model-arena/live/live-timeline.js', () => ({
  liveTimeline: async () => ({ phase: 'replay', status: 'research', pendingAt: sample.asOf }),
}));
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

function setup(replies: { text: string; finish?: string }[]) {
  const protocol = arenaLiveProtocolSchema.parse({ ...sample.protocol, version: 'arena-live-match-protocol-v1' });
  const binding = protocol.entrants[0]!;
  const account = arenaLiveAccountSchema.parse({ ...sample.account,
    fills: sample.account.fills.map((fill: Record<string, unknown>) => ({ ...fill, evidence: { offline: true } })) });
  const agent = { id: 'agent', account, remaining: binding.budget, providerId: binding.providerId, model: binding.model };
  const cycle = { id: 'cycle', matchId: 'match', agentId: 'agent', state: 'running', attempt: 1, requestId: 'request',
    bookRevision: account.revision, leaseUntil: new Date(Date.now() + 60000), deadlineAt: null,
    input: { protocol, account: structuredClone(account), replay: true, asOf: sample.asOf } };
  mocks.match.mockResolvedValue({ id: 'match', state: 'running', protocol, remaining: protocol.budget });
  mocks.agents.mockImplementation(async () => [agent]);
  mocks.save.mockImplementation(async (_tx, _id, next) => { agent.account = next; });
  mocks.prepare.mockResolvedValue({ verify: async (model: string) => ({ accepted: model === binding.model }) });
  const db = {
    $queryRaw: vi.fn(async (q: TemplateStringsArray) => q.join('').includes('SELECT *') ? [cycle] : [{ id: 'cycle' }]),
    $executeRaw: vi.fn(async () => 1),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  const context: ArenaPaperContext = { at: sample.asOf, tradingDate: '2026-11-02', maxPositionBps: protocol.maxPositionBps,
    maxActiveSymbols: protocol.resources.maxActiveSymbols, allowedSymbols: new Set(['510300.SH']), fees: protocol.fees,
    expiresAt: () => '2026-11-02T03:30:00Z', newId: () => crypto.randomUUID(), quotes: [{ symbol: '510300.SH', price: '4.091',
      marketTime: sample.asOf, observedAt: sample.asOf, sourceRef: 'offline', evidence: {}, tradingDate: '2026-11-02',
      positionAvailableOn: '2026-11-03', cashAvailableOn: '2026-11-02', lot: '100', tick: '0.001',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
  const execution = { build: vi.fn(async () => ({ context, session: { state: 'open', sessions: [
    { startAt: '2026-11-02T01:30:00Z', endAt: '2026-11-02T03:30:00Z' } ] } })) };
  const orders = new LiveOrdersRepository(db as never, execution as never);
  const submitted = vi.spyOn(orders, 'submit');
  const registry = { strictReadyContract: () => ({ provider: { sdkRuntime: () => ({ baseURL: 'https://offline.invalid/v1', apiKey: '', authMode: 'none' }),
    metadata: { modelPricing: { [binding.model]: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'CNY' } } } },
    execution: { adapter: 'openai-compatible-chat', mode: 'native_schema' } }) };
  const sdk = new AiSdkGenerationAdapter();
  const wire: { messages: { role: string; content: string }[] }[] = [], receipts: unknown[] = [];
  const generate = { generate: vi.fn(async (input: Parameters<typeof sdk.generate>[0]) => sdk.generate({ ...input,
    httpClient: async (_url, init) => {
      const reply = replies[wire.length]; if (!reply) throw new Error('禁止超过固定回复数量');
      wire.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'offline', object: 'chat.completion', created: 0, model: binding.model,
        choices: [{ index: 0, message: { role: 'assistant', content: reply.text }, finish_reason: reply.finish ?? 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    } })) };
  const budget = { reserve: vi.fn(), settle: vi.fn(async (_id, _requestId, _used, receipt) => { receipts.push(receipt); }),
    fail: vi.fn(), tool: vi.fn() };
  const call = new LiveResearchCall(db as never, registry as never, generate as never, budget as never);
  const tools = { execute: vi.fn(() => { throw new Error('禁止来源读取'); }) };
  const runner = new LiveResearchRunner(db as never, call, tools, budget as never, orders);
  const network = vi.fn(() => { throw new Error('禁止真实网络'); }); vi.stubGlobal('fetch', network);
  return { runner, wire, receipts, budget, submitted, agent, before: structuredClone(account), network, tools };
}
const watch = () => JSON.stringify({ action: 'decision', decision: { summary: '保留持仓与原保护，等待可卖日',
  orders: [], cancelOrderIds: [], watchedSymbols: ['510300.SH'], wakeups: [{ kind: 'time', at: '2026-11-02T03:00:00Z' }] } });
const sell = () => {
  const answer = JSON.parse(sample.outputText); answer.decision.orders[0].onFill = null; answer.decision.orders[0].expiresOn = null;
  answer.decision.cancelOrderIds = sample.account.orders.filter((o: { side: string; state: string }) => o.side === 'sell' && o.state === 'active').map((o: { id: string }) => o.id);
  return JSON.stringify(answer);
};

it.each(['schema', 'settlement'] as const)('%s 拒绝经实际 SDK、调用器、研究器和提交器反馈后提交观望', async kind => {
  const s = setup([{ text: kind === 'schema' ? sample.outputText : sell() }, { text: watch() }]);
  await s.runner.execute('cycle', 1);
  expect(s.wire).toHaveLength(2);
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(s.agent.account.positions).toEqual(s.before.positions);
  expect(s.agent.account.orders).toEqual(s.before.orders);
  expect(s.agent.account.cash).toBe(s.before.cash);
  expect(s.agent.account.revision).toBe(s.before.revision + 1);
  expect(s.budget.fail).not.toHaveBeenCalled();
  const feedback = JSON.parse(s.wire[1]!.messages.at(-1)!.content).decisionRejected;
  expect(feedback).toMatchObject({ code: kind === 'schema' ? 'schema_invalid' : 'insufficient_position', accountChanged: false, observedAt: sample.asOf });
  if (kind === 'schema') expect(s.receipts[0]).toMatchObject({ error: { code: 'schema_invalid' } });
  else expect(feedback.sellAvailability).toMatchObject({ availableQuantity: '0', unsettledQuantity: '5000' });
  expect(s.network).not.toHaveBeenCalled(); expect(s.tools.execute).not.toHaveBeenCalled();
});
it('Schema 修正后仍因 T+1 拒绝时共享上限，整轮没有账户写入', async () => {
  const s = setup([{ text: sample.outputText }, { text: sell() }]);
  await s.runner.execute('cycle', 1);
  expect(s.wire).toHaveLength(2); expect(mocks.save).not.toHaveBeenCalled();
  expect(s.agent.account).toEqual(s.before);
  expect(s.budget.fail).toHaveBeenCalledWith('cycle', 1, 'insufficient_position', 'insufficient_position');
});
it('即使正文是完整决策，上游 length 也只调用一次并保留截断失败', async () => {
  const s = setup([{ text: watch(), finish: 'length' }]);
  await s.runner.execute('cycle', 1);
  expect(s.wire).toHaveLength(1); expect(mocks.save).not.toHaveBeenCalled();
  expect(s.submitted).not.toHaveBeenCalled(); expect(s.receipts[0]).toMatchObject({ error: { code: 'output_truncated' } });
  expect(s.budget.fail).toHaveBeenCalledWith('cycle', 1, 'model_output_invalid', 'model_output_invalid');
});
