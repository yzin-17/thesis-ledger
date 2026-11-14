import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { LiveResearchCall } from '../../src/model-arena/live/live-research-call.js';
import { liveProtocolFixture } from './live-fixture.js';
import type * as LiveStorage from '../../src/model-arena/live/live-storage.js';

const mocks = vi.hoisted(() => ({ match: vi.fn(), agents: vi.fn(), prepare: vi.fn() }));
vi.mock('../../src/model-arena/live/live-storage.js', async (original) => ({
  ...(await original<typeof LiveStorage>()),
  liveMatch: mocks.match,
  liveAgents: mocks.agents,
}));
vi.mock('../../src/ai/ai-model-receipt.js', () => ({ prepareModelReceipt: mocks.prepare }));
const at = new Date('2026-11-12T16:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(at);
});
afterEach(() => vi.useRealTimers());

function fixture() {
  const protocol = liveProtocolFixture();
  const cycle = {
    id: 'cycle',
    matchId: 'match',
    agentId: 'agent',
    state: 'running',
    attempt: 1,
    leaseUntil: new Date(at.getTime() + 60000),
    deadlineAt: new Date(at.getTime() + 30000),
  };
  mocks.match.mockResolvedValue({ id: 'match', protocol, remaining: protocol.budget });
  mocks.agents.mockResolvedValue([
    { id: 'agent', providerId: 'fixture', model: 'first', remaining: protocol.entrants[0]!.budget },
  ]);
  const proof = { accepted: true };
  mocks.prepare.mockResolvedValue({ verify: vi.fn().mockResolvedValue(proof) });
  const price = {
    costPer1kInput: 0.01,
    costPer1kOutput: 0.02,
    costCurrency: 'USD',
    pricingVersion: 'controlled',
  };
  const runtime = {
    baseURL: 'https://example.invalid',
    apiKey: 'controlled-not-a-key',
    authMode: 'api_key',
  };
  const route = {
    provider: { sdkRuntime: () => runtime, metadata: { modelPricing: { first: price } } },
    execution: { adapter: 'openai-chat', mode: 'native_schema' },
  };
  const registry = { strictReadyContract: vi.fn().mockReturnValue(route) };
  const output = aiGenerationContracts.arenaLiveResearch.schema.parse({
    action: 'decision',
    decision: {
      summary: '观察',
      orders: [],
      cancelOrderIds: [],
      watchedSymbols: [],
      wakeups: [{ kind: 'time', at: '2026-11-13T16:00:00Z' }],
    },
  });
  const result = {
    output,
    actualModel: 'first',
    usage: { status: 'reported', inputTokens: 10, outputTokens: 5 },
    providerCost: null,
    providerCostCurrency: null,
  };
  const sdk = { generate: vi.fn().mockResolvedValue(result) };
  const sequence: string[] = [];
  const budget = {
    reserve: vi.fn(async () => {
      sequence.push('reserve');
    }),
    settle: vi.fn<
      (id: string, requestId: string, used: unknown, receipt: unknown) => Promise<void>
    >(async () => {
      sequence.push('settle');
    }),
  };
  sdk.generate.mockImplementation(async () => {
    sequence.push('generate');
    return result;
  });
  const db = { $queryRaw: vi.fn().mockResolvedValue([cycle]) };
  const call = new LiveResearchCall(db as never, registry as never, sdk as never, budget as never);
  return { call, cycle, price, sdk, budget, output, result, proof, sequence };
}

it('请求保留超时、合同和身份，预留后执行并按已知用量结算', async () => {
  const f = fixture();
  expect(await f.call.generate('cycle', 1, [{ role: 'user', content: '受控材料' }])).toEqual(
    f.output,
  );
  expect(f.sequence).toEqual(['reserve', 'generate', 'settle']);
  expect(f.sdk.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'first',
      transport: 'single',
      timeout: { totalMs: 30000 },
      contract: aiGenerationContracts.arenaLiveResearch.ref,
    }),
  );
  expect(f.budget.settle).toHaveBeenCalledWith(
    'cycle',
    expect.any(String),
    { requests: 1, tokens: 15, costMicros: 200 },
    expect.objectContaining({ output: f.output, modelIdentity: f.proof }),
  );
});

it.each(['lease', 'pricing'] as const)('%s 准入失败不预留、不调用 SDK', async (invalid) => {
  const f = fixture();
  if (invalid === 'lease') f.cycle.leaseUntil = at;
  else f.price.costCurrency = 'CNY';
  await expect(f.call.generate('cycle', 1, [])).rejects.toThrow(
    invalid === 'lease' ? 'cycle_not_active' : 'unknown_pricing',
  );
  expect(f.budget.reserve).not.toHaveBeenCalled();
  expect(f.sdk.generate).not.toHaveBeenCalled();
  expect(f.budget.settle).not.toHaveBeenCalled();
});

it('身份复核拒绝仍结算已知用量，未知用量保留 null', async () => {
  const identity = fixture();
  identity.proof.accepted = false;
  await expect(identity.call.generate('cycle', 1, [])).rejects.toThrow('model_identity_unverified');
  expect(identity.budget.settle.mock.calls[0]?.[2]).toEqual({
    requests: 1,
    tokens: 15,
    costMicros: 200,
  });
  const unknown = fixture();
  unknown.sdk.generate.mockResolvedValue({
    ...unknown.result,
    usage: { status: 'unknown', inputTokens: null, outputTokens: null },
  } as never);
  await expect(unknown.call.generate('cycle', 1, [])).rejects.toThrow('unknown_usage');
  expect(unknown.budget.settle.mock.calls[0]?.[2]).toBeNull();
});
