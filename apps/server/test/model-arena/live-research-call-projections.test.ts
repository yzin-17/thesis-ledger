import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aiGenerationContracts, arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { LiveResearchCall } from '../../src/model-arena/live/live-research-call.js';
import { liveProtocolFixture } from './live-fixture.js';
import type * as LiveStorage from '../../src/model-arena/live/live-storage.js';
import { buildLiveResearchMessages } from '../../src/model-arena/live/live-research-messages.js';
import { liveResearchContract } from '../../src/model-arena/live/live-research-contract.js';
import { buildGenerationSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';
import { NoObjectGeneratedError } from 'ai';
import { AiSdkGenerationError, resultMetadata } from '../../src/ai/ai-sdk-generation-facts.js';
import { LiveInvalidDecisionError } from '../../src/model-arena/live/live-invalid-decision.js';

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
  for (const entrant of protocol.entrants) entrant.maxInputTokens = 30000;
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
  const cycle = {
    id: 'cycle',
    matchId: 'match',
    agentId: 'agent',
    state: 'running',
    attempt: 1,
    leaseUntil: new Date(at.getTime() + 60000),
    deadlineAt: new Date(at.getTime() + 30000),
    input: { protocol: structuredClone(protocol), account, asOf: at.toISOString(), replay: false },
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
  const messages = () => buildLiveResearchMessages({ ...cycle.input });
  return { call, cycle, protocol, price, sdk, budget, output, result, proof, sequence, messages };
}

it('请求保留超时、合同和身份，预留后执行并按已知用量结算', async () => {
  const f = fixture();
  expect(await f.call.generate('cycle', 1, f.messages())).toEqual(f.output);
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
  await expect(identity.call.generate('cycle', 1, identity.messages())).rejects.toThrow(
    'model_identity_unverified',
  );
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
  await expect(unknown.call.generate('cycle', 1, unknown.messages())).rejects.toThrow(
    'unknown_usage',
  );
  expect(unknown.budget.settle.mock.calls[0]?.[2]).toBeNull();
});

it('采用周期冻结的能力，当前比赛的网页授权变化不扩张旧周期', async () => {
  const f = fixture();
  f.protocol.allowWebSearch = true;
  f.cycle.input.replay = true;
  const messages = f.messages();
  await f.call.generate('cycle', 1, messages);
  const request = f.sdk.generate.mock.calls[0]![0] as unknown as {
    schema: ReturnType<typeof liveResearchContract>['schema'];
  };
  expect(
    request.schema.safeParse({ action: 'tools', requests: [{ name: 'web_search', query: '观察' }] })
      .success,
  ).toBe(false);
  expect(
    request.schema.safeParse({
      action: 'tools',
      requests: [{ name: 'bars', symbol: 'SPY.US', timeframe: '1d', limit: 5 }],
    }).success,
  ).toBe(false);
  expect(f.budget.reserve).toHaveBeenCalledWith(
    'cycle',
    1,
    expect.any(String),
    expect.anything(),
    expect.objectContaining({
      capabilities: liveResearchContract({ protocol: f.cycle.input.protocol, replay: true })
        .capabilities,
    }),
  );
});

it('提示词仍带通用合同而请求已收窄时，在身份探测和预算预留前拒绝', async () => {
  const f = fixture();
  const messages = f.messages();
  messages[0]!.content = buildGenerationSchemaPrompt(
    aiGenerationContracts.arenaLiveResearch.schema,
  );
  await expect(f.call.generate('cycle', 1, messages)).rejects.toMatchObject({
    fact: { code: 'configuration_invalid', externalResult: 'not_sent' },
  });
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(f.budget.reserve).not.toHaveBeenCalled();
  expect(f.sdk.generate).not.toHaveBeenCalled();
});

it.each([false, true])(
  '实时请求的网页授权沿用冻结值 %s，不受当前比赛配置改变影响',
  async (allowed) => {
    const f = fixture();
    f.protocol.allowWebSearch = !allowed;
    f.cycle.input.protocol.allowWebSearch = allowed;
    await f.call.generate('cycle', 1, f.messages());
    const request = f.sdk.generate.mock.calls[0]![0] as unknown as {
      schema: ReturnType<typeof liveResearchContract>['schema'];
    };
    expect(
      request.schema.safeParse({
        action: 'tools',
        requests: [{ name: 'web_search', query: '观察' }],
      }).success,
    ).toBe(allowed);
  },
);

function invalidReply(code: 'schema_invalid' | 'output_truncated' = 'schema_invalid', known = true) {
  const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3,
    inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokenDetails: { textTokens: 2, reasoningTokens: 0 } };
  const completion = resultMetadata(usage, code === 'output_truncated' ? 'length' : 'stop', undefined,
    { modelId: 'first' }, undefined, { firstEvent: null, firstText: null });
  if (!known) completion.usage = { status: 'unknown', inputTokens: null, outputTokens: null };
  return new AiSdkGenerationError({ code, phase: 'validation', externalResult: 'complete', requestId: 'fixture', summary: '固定拒绝' },
    completion.usage, { completion, cause: new NoObjectGeneratedError({ message: '固定拒绝',
      text: JSON.stringify({ action: 'decision', decision: { summary: '观望', orders: [], cancelOrderIds: [], watchedSymbols: [], wakeups: [] } }),
      response: { id: 'fixture', timestamp: new Date(0), modelId: 'first' }, usage, finishReason: completion.finishReason }) });
}
it('完整无效决策先结算失败调用并核验身份，再交出有界修正信息', async () => {
  const f = fixture(); f.sdk.generate.mockRejectedValueOnce(invalidReply());
  await expect(f.call.generate('cycle', 1, f.messages())).rejects.toBeInstanceOf(LiveInvalidDecisionError);
  expect(f.sdk.generate).toHaveBeenCalledOnce();
  expect(f.budget.settle).toHaveBeenCalledOnce();
  expect(f.budget.settle.mock.calls[0]![3]).toMatchObject({ error: { code: 'schema_invalid' }, modelIdentity: { accepted: true } });
});
it.each(['output_truncated', 'unknown_usage', 'model_identity_unverified'] as const)('%s 不生成可修正错误', async reason => {
  const f = fixture();
  f.sdk.generate.mockRejectedValueOnce(invalidReply(reason === 'output_truncated' ? reason : 'schema_invalid', reason !== 'unknown_usage'));
  if (reason === 'model_identity_unverified') f.proof.accepted = false;
  const error = await f.call.generate('cycle', 1, f.messages()).catch(e => e);
  expect(error).not.toBeInstanceOf(LiveInvalidDecisionError);
  expect(error.message).toBe(reason === 'output_truncated' ? 'model_output_invalid' : reason);
  expect(f.sdk.generate).toHaveBeenCalledOnce();
  expect(f.budget.settle).toHaveBeenCalledOnce();
});
