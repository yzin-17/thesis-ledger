import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts, arenaLiveAccountSchema, type ArenaLiveProtocol } from '@thesis-ledger/schemas';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import type { AiSdkGenerationRequest, AiSdkGenerationResult } from '../../src/ai/ai-sdk-generation.adapter.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveAppointments } from '../../src/model-arena/live/live-appointments.js';
import { LiveCyclesRepository } from '../../src/model-arena/live/live-cycles.repository.js';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import { LiveResearchBudget } from '../../src/model-arena/live/live-research-budget.js';
import { LiveResearchCall } from '../../src/model-arena/live/live-research-call.js';
import { LiveResearchRunner } from '../../src/model-arena/live/live-research-runner.js';
import { LiveResearchControl } from '../../src/model-arena/live/live-research-control.js';
import { liveAgents, liveMatch, type LiveCycleRow } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const matches: string[] = [];
const observe = { action: 'decision', decision: { summary: '仅在成交时重新观察', orders: [], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol: null }] } };
async function setup(requests = 10, unlimited = false, unlimitedCall = false, resources: Partial<ArenaLiveProtocol['resources']> = {}, sessionEnd?: Date, modelCount = 2) {
  const budget = unlimited ? { requests: null, tokens: null, costMicros: null } : { requests, tokens: 100000, costMicros: 1000 };
  const p = liveProtocolFixture({ ...(unlimited ? { budget } : {}), entrants: ['first', 'second'].slice(0, modelCount).map((model) => ({ model, providerId: 'fixture', budget, maxInputTokens: unlimitedCall ? null : 30000, maxOutputTokens: unlimitedCall ? null : 2000 })) });
  p.resources = { ...p.resources, ...resources };
  const owner = randomUUID(), store = new LiveMatchesRepository(db), created = await store.create(owner, p);
  matches.push(created.id); await store.transition(owner, created.id, 'running');
  const now = new Date(Date.now() + 1);
  const market = { getSession: vi.fn().mockResolvedValue({ state: 'open', date: '2026-11-12', evaluatedAt: now.toISOString(), sessions: [] }), getQuote: vi.fn() };
  const appointments = new LiveAppointments(db, market);
  const [cycleId] = await appointments.admit(created.id, now);
  const cycles = new LiveCyclesRepository(db); await cycles.claim(cycleId!, 1, new Date(), sessionEnd);
  const registry = new AiProviderRegistry();
  registry.register({ id: 'fixture', models: ['first', 'second'], metadata: { baseURL: 'http://127.0.0.1:1', authMode: 'none',
    upstreamFormat: 'chat-completions', chatImplementation: 'compatible', adapter: 'openai-compatible',
    modelPricing: Object.fromEntries(['first', 'second'].map((model) => [model, { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD', pricingVersion: 'fixture', updatedAt: new Date().toISOString(), source: 'user' as const }])),
    executionRoutes: ['first', 'second'].map((model) => ({ model, mode: 'json_validated', contract: aiGenerationContracts.arenaLiveResearch.ref })),
  }, sdkRuntime: () => ({ baseURL: 'http://127.0.0.1:1', apiKey: '', authMode: 'none', timeoutMs: 10000 }) });
  const steps: unknown[] = [observe];
  let wrongIdentity = false, unknown = false;
  const sdk = { generate: vi.fn(async <T>(input: AiSdkGenerationRequest<T>): Promise<AiSdkGenerationResult<T>> => {
    if (unknown) throw new Error('受控连接失联');
    return { output: input.schema.parse(steps.shift()), actualModel: wrongIdentity ? 'other' : input.model,
      finishReason: 'stop', rawFinishReason: 'stop', usage: { status: 'reported', inputTokens: 50, outputTokens: 30 },
      providerCost: '0', providerCostCurrency: 'USD', timeToFirstEventMs: null, timeToFirstTextMs: null };
  }) };
  const tools = { execute: vi.fn().mockResolvedValue({ items: [{ symbol: 'AAPL.US', name: '受控目录' }] }) };
  const accounting = new LiveResearchBudget(db);
  const call = new LiveResearchCall(db, registry, { generate: <T>(input: AiSdkGenerationRequest<T>) => sdk.generate(input) as Promise<AiSdkGenerationResult<T>> }, accounting);
  const orders = new LiveOrdersRepository(db, new LiveExecutionContext(db, market, { read: vi.fn() }));
  const runner = new LiveResearchRunner(db, call, tools, accounting, orders);
  return { id: created.id, cycleId: cycleId!, owner, runner, sdk, tools, steps, cycles, store, orders,
    wrong: () => { wrongIdentity = true; }, unknown: () => { unknown = true; } };
}
async function state(id: string) {
  return (await db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`)[0]!;
}
describe.skipIf(!url)('自主模型只读研究与预算', () => {
  afterAll(async () => {
    for (const id of matches) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('历史执行证据拒绝后向模型返回原时点反馈，修正后的完整决策才提交', async () => {
    const s = await setup(10, true, true);
    const submit = vi.spyOn(s.orders, 'submit').mockRejectedValueOnce(new Error('replay_rules_unavailable'));
    s.steps.unshift(observe);
    await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'succeeded' });
    expect(submit).toHaveBeenCalledTimes(2); expect(s.sdk.generate).toHaveBeenCalledTimes(2);
    const messages = s.sdk.generate.mock.calls[1]![0].messages as { role: string; content: string }[];
    const feedback = messages.find((m) => m.role === 'user' && m.content.includes('"decisionRejected"'))!;
    expect(JSON.parse(String(feedback.content))).toMatchObject({ decisionRejected: { code: 'replay_rules_unavailable', accountChanged: false } });
    const cycle = await state(s.cycleId), agent = (await liveAgents(db, s.id)).find((a) => a.id === cycle.agentId)!;
    expect(arenaLiveAccountSchema.parse(agent.account).orders).toEqual([]);
  });
  it('明确证据拒绝只修正一次，重复拒绝保持终态；租约错误不请求模型修正', async () => {
    for (const reason of ['replay_rules_unavailable', 'cycle_not_active']) {
      const s = await setup(10, true, true), before = (await liveAgents(db, s.id)).map((a) => a.account);
      vi.spyOn(s.orders, 'submit').mockRejectedValue(new Error(reason)); s.steps.unshift(observe);
      await s.runner.execute(s.cycleId, 1);
      expect(await state(s.cycleId)).toMatchObject({ state: 'failed', reason });
      expect(s.sdk.generate).toHaveBeenCalledTimes(reason === 'cycle_not_active' ? 1 : 2);
      expect((await liveAgents(db, s.id)).map((a) => a.account)).toEqual(before);
    }
  });
  it('单模型启动、研究和最终预约完成，账户保持独立', async () => {
    const s = await setup(10, true, true, { maxResearchSteps: null, maxCycleSeconds: null }, undefined, 1);
    await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'succeeded' });
    const agents = await liveAgents(db, s.id); expect(agents).toHaveLength(1);
    expect(arenaLiveAccountSchema.parse(agents[0]!.account).wakeups.map((w) => w.condition.kind)).toEqual(['fill']);
    expect(s.sdk.generate).toHaveBeenCalledOnce();
  });
  it('不设步骤和时限时超过二十轮及会话边界，模型最终决策才结束', async () => {
    const s = await setup(10, true, true, { maxResearchSteps: null, maxCycleSeconds: null }, new Date(Date.now() + 100));
    expect((await state(s.cycleId)).deadlineAt).toBeNull();
    s.steps.unshift(...Array.from({ length: 25 }, () => ({ action: 'tools', requests: [{ name: 'search_instruments', query: 'AAPL' }] })));
    await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'succeeded', leaseUntil: null, deadlineAt: null });
    expect(s.sdk.generate).toHaveBeenCalledTimes(26); expect(s.tools.execute).toHaveBeenCalledTimes(25);
    for (const [request] of s.sdk.generate.mock.calls) expect(request.timeout).toEqual({});
  });
  it('独立有限步骤仍中止，不设时限不放开已设置的步骤数', async () => {
    const s = await setup(10, true, true, { maxResearchSteps: 1, maxCycleSeconds: null });
    s.steps.unshift({ action: 'tools', requests: [{ name: 'search_instruments', query: 'AAPL' }] });
    await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'failed', reason: 'research_steps_exhausted' });
    expect(s.sdk.generate).toHaveBeenCalledOnce();
  });
  it('停止 Worker 会中止没有业务截止的 SDK 请求且不提交决策', async () => {
    const s = await setup(10, true, true, { maxResearchSteps: null, maxCycleSeconds: null });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    s.sdk.generate.mockImplementationOnce(async (request) => {
      started(); return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    });
    const running = s.runner.execute(s.cycleId, 1); await ready; s.runner.stop(); await running;
    expect(await state(s.cycleId)).toMatchObject({ state: 'unknown_usage', reason: 'unknown_usage', decision: null });
    await s.runner.execute(s.cycleId, 1); expect(s.sdk.generate).toHaveBeenCalledOnce();
  });
  it('不限时任务续租后不会被恢复扫描误判，丢失租约或旧 attempt 不能复活', async () => {
    const s = await setup(10, true, true, { maxCycleSeconds: null });
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "leaseUntil"=${new Date(Date.now() + 1000)} WHERE id=${s.cycleId}::uuid`;
    const control = new LiveResearchControl(db, s.cycleId, 1, null);
    await control.start(); await s.cycles.recover(new Date(Date.now() + 2000));
    expect((await state(s.cycleId)).state).toBe('running'); await control.close();
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "leaseUntil"=${new Date(Date.now() - 1000)} WHERE id=${s.cycleId}::uuid`;
    const expired = new LiveResearchControl(db, s.cycleId, 1, null);
    await expect(expired.start()).rejects.toThrow('cycle_not_active'); await expired.close();
    await s.cycles.recover(); expect((await state(s.cycleId)).state).toBe('pending');
    await s.cycles.claim(s.cycleId, 2);
    const stale = new LiveResearchControl(db, s.cycleId, 1, null);
    await expect(stale.start()).rejects.toThrow('cycle_not_active'); await stale.close();
    expect((await state(s.cycleId)).attempt).toBe(2);
  });
  it('暂停实际取消不限时在途请求，保留未知结果且不继续研究', async () => {
    const s = await setup(10, true, true, { maxResearchSteps: null, maxCycleSeconds: null });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    s.sdk.generate.mockImplementationOnce(async (request) => {
      started(); return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    });
    const running = s.runner.execute(s.cycleId, 1); await ready;
    await s.store.transition(s.owner, s.id, 'paused'); await running;
    expect(await state(s.cycleId)).toMatchObject({ state: 'unknown_usage', reason: 'arena_paused', decision: null });
    expect(s.sdk.generate).toHaveBeenCalledOnce(); expect(s.sdk.generate.mock.calls[0]![0].signal.aborted).toBe(true);
  }, 15000);
  it('不限单次和总额的请求不传 SDK 输出上限，仍记录实际用量和有效限制', async () => {
    const s = await setup(10, true, true);
    await s.runner.execute(s.cycleId, 1);
    expect((await state(s.cycleId)).state).toBe('succeeded');
    expect(s.sdk.generate.mock.calls[0]![0]).not.toHaveProperty('maxOutputTokens');
    const audit = (await state(s.cycleId)).requestAudit as { calls: { used: unknown; input: { limits: unknown } }[] };
    expect(audit.calls[0]!.used).toMatchObject({ requests: 1, tokens: 80 });
    expect(audit.calls[0]!.input.limits).toMatchObject({ input: null, output: null, effectiveOutput: null });
  });
  it('不限单次但有限总令牌时，由剩余总额导出 SDK 输出边界并按实际用量退款', async () => {
    const s = await setup(10, false, true);
    await s.runner.execute(s.cycleId, 1);
    expect((await state(s.cycleId)).state).toBe('succeeded');
    const request = s.sdk.generate.mock.calls[0]![0];
    expect(request.maxOutputTokens).toBeGreaterThan(0);
    const audit = (await state(s.cycleId)).requestAudit as { calls: { reserved: { tokens: number } }[] };
    expect(audit.calls[0]!.reserved.tokens).toBe(100000);
    const cycle = await state(s.cycleId), agent = (await liveAgents(db, s.id)).find((a) => a.id === cycle.agentId)!;
    expect(agent.remaining).toEqual({ requests: 9, tokens: 99920, costMicros: 1000 });
  });
  it('不限总额度仍完成多步受控研究、工具、审计与新预约，剩余额度保持空值', async () => {
    const s = await setup(10, true);
    s.steps.unshift({ action: 'tools', requests: [{ name: 'search_instruments', query: 'AAPL' }] });
    await s.runner.execute(s.cycleId, 1);
    const saved = await state(s.cycleId), remaining = { requests: null, tokens: null, costMicros: null };
    expect(saved.state).toBe('succeeded'); expect(s.sdk.generate).toHaveBeenCalledTimes(2); expect(s.tools.execute).toHaveBeenCalledOnce();
    expect((await liveMatch(db, s.id)).remaining).toEqual(remaining);
    const agent = (await liveAgents(db, s.id)).find((a) => a.id === saved.agentId)!;
    expect(agent.remaining).toEqual(remaining); expect(agent.state).toBe('waiting');
    expect(arenaLiveAccountSchema.parse(agent.account).wakeups.map((w) => w.condition.kind)).toEqual(['fill']);
    expect((saved.requestAudit as { calls: unknown[] }).calls).toHaveLength(3);
  });
  it('工具研究后一次提交事件预约，每步耗用分别结算且不引入定期研究', async () => {
    const s = await setup();
    s.steps.unshift({ action: 'tools', requests: [{ name: 'search_instruments', query: 'AAPL' }] });
    await s.runner.execute(s.cycleId, 1);
    expect((await state(s.cycleId)).state).toBe('succeeded');
    expect(s.sdk.generate).toHaveBeenCalledTimes(2); expect(s.tools.execute).toHaveBeenCalledOnce();
    const cycle = await state(s.cycleId);
    const agent = (await liveAgents(db, s.id)).find((a) => a.id === cycle.agentId)!;
    expect(arenaLiveAccountSchema.parse(agent.account).wakeups.map((w) => w.condition.kind)).toEqual(['fill']);
    expect(agent.remaining).toEqual({ requests: 7, tokens: 99840, costMicros: 1000 });
    expect((cycle.requestAudit as { calls: unknown[]; tools: unknown[] }).calls).toHaveLength(3);
    expect((cycle.requestAudit as { tools: unknown[] }).tools).toHaveLength(1);
  });
  it('实际模型不匹配时不提交预约或委托，仍照实结算已用预算', async () => {
    const s = await setup(); s.wrong(); await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'failed', reason: 'model_identity_unverified' });
    const savedCycle = await state(s.cycleId);
    const agent = (await liveAgents(db, s.id)).find((a) => a.id === savedCycle.agentId)!;
    expect(arenaLiveAccountSchema.parse(agent.account).orders).toEqual([]);
    expect(agent.remaining).toEqual({ requests: 9, tokens: 99920, costMicros: 1000 });
  });
  it('额度不足在出站前拒绝，保留比赛预算', async () => {
    const s = await setup(0), before = (await liveMatch(db, s.id)).remaining;
    await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'failed', reason: 'participant_budget' });
    expect(s.sdk.generate).not.toHaveBeenCalled(); expect((await liveMatch(db, s.id)).remaining).toEqual(before);
  });
  it('工具同样在调用前检查模型与全场请求额度，额度用尽不继续读取来源', async () => {
    const s = await setup(1);
    s.steps.unshift({ action: 'tools', requests: [{ name: 'search_instruments', query: 'AAPL' }] });
    await s.runner.execute(s.cycleId, 1);
    expect(s.sdk.generate).toHaveBeenCalledOnce(); expect(s.tools.execute).not.toHaveBeenCalled();
    expect(await state(s.cycleId)).toMatchObject({ state: 'failed', reason: 'participant_budget' });
  });
  it('出站后结果未知保留预留，重复执行不会补发', async () => {
    const s = await setup(); s.unknown(); await s.runner.execute(s.cycleId, 1); await s.runner.execute(s.cycleId, 1);
    expect(await state(s.cycleId)).toMatchObject({ state: 'unknown_usage', reason: 'unknown_usage' });
    expect(s.sdk.generate).toHaveBeenCalledOnce();
  });
});
