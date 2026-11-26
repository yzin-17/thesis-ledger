import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema, arenaLiveProtocolSchema } from '@thesis-ledger/schemas';
import { arenaSellAvailability, arenaSubmitDecision, ArenaSellAvailabilityError } from '@thesis-ledger/domain';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { liveCallFailureDiagnostics } from '../../src/model-arena/live/live-call-diagnostics.js';
import { invalidDecisionForCorrection, LiveInvalidDecisionError } from '../../src/model-arena/live/live-invalid-decision.js';
import { liveResearchContract } from '../../src/model-arena/live/live-research-contract.js';
import { buildLiveResearchMessages } from '../../src/model-arena/live/live-research-messages.js';
import { liveDecisionFeedback } from '../../src/model-arena/live/live-decision-feedback.js';
import type { ArenaPaperContext } from '@thesis-ledger/domain';
import type { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/invalid-sell-20261102.json', import.meta.url), 'utf8'));
const protocol = arenaLiveProtocolSchema.parse({ ...sample.protocol, version: 'arena-live-match-protocol-v1' });
// 原提示有意省略成交证据；本地替身只补回非业务标记，不伪造执行材料。
const account = arenaLiveAccountSchema.parse({ ...sample.account,
  fills: sample.account.fills.map((fill: Record<string, unknown>) => ({ ...fill, evidence: { kind: 'offline_prompt_projection' } })) });
const contract = liveResearchContract({ protocol, replay: true });
const messages = () => buildLiveResearchMessages({ protocol, account, asOf: sample.asOf, replay: true });
afterEach(() => vi.unstubAllGlobals());

it('真实失败原文摘要保持且仍被拒绝；冻结可卖量使用历史业务日', () => {
  expect(createHash('sha256').update(sample.outputText).digest('hex')).toBe(sample.outputSha256);
  expect(contract.schema.safeParse(JSON.parse(sample.outputText)).success).toBe(false);
  const input = JSON.parse(messages()[1]!.content);
  expect(input.sellAvailability).toEqual([arenaSellAvailability(account, '510300.SH', '2026-11-02')]);
  expect(input.sellAvailability[0]).toMatchObject({ totalQuantity: '5000', availableQuantity: '0',
    unsettledQuantity: '5000', settlements: [{ availableOn: '2026-11-03', quantity: '5000' }] });
  const next = buildLiveResearchMessages({ protocol, account, replay: true, asOf: '2026-11-02T16:01:00Z' });
  expect(JSON.parse(next[1]!.content).sellAvailability[0].tradingDate).toBe('2026-11-03');
  expect(messages()[0]!.content).toContain('不能解除结算限制');
});

it.each(['native_schema', 'json_validated', 'json_mode'] as const)('%s 固定失败回复产生明确字段反馈，禁止真实网络', async mode => {
  const network = vi.fn(() => { throw new Error('禁止真实网络'); }); vi.stubGlobal('fetch', network);
  const sdk = new AiSdkGenerationAdapter();
  let failure: unknown;
  try {
    await sdk.generate({ requestId: sample.requestId, adapter: 'openai-compatible-chat', providerId: 'fixture',
      baseURL: 'https://offline.invalid/v1', apiKey: '', authMode: 'none', model: 'fixture',
      messages: messages(), contract: contract.ref, schema: contract.schema, mode, transport: 'single', timeout: {},
      signal: new AbortController().signal,
      httpClient: async () => new Response(JSON.stringify({ id: 'offline', object: 'chat.completion', created: 0, model: 'fixture',
        choices: [{ index: 0, message: { role: 'assistant', content: sample.outputText }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 9229, completion_tokens: 686, total_tokens: 9915 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });
  } catch (e) { failure = e; }
  expect(failure).toMatchObject({ fact: { code: 'schema_invalid', externalResult: 'complete' } });
  const diagnostics = liveCallFailureDiagnostics(failure, contract.schema, '');
  const error = invalidDecisionForCorrection(sample.error, diagnostics, contract.schema);
  expect(error).toBeInstanceOf(LiveInvalidDecisionError);
  expect(error!.reply).toBe(sample.outputText);
  expect(error!.issues.map(i => i.path)).toEqual([
    ['decision', 'orders', 0, 'onFill'], ['decision', 'orders', 0, 'onFill', 'activateOrders'], ['decision', 'orders', 0, 'expiresOn'],
  ]);
  expect(liveDecisionFeedback(error, sample.asOf)).toMatchObject({
    decisionRejected: { code: 'schema_invalid', observedAt: sample.asOf, accountChanged: false },
  });
  for (const code of ['output_truncated', 'transport_unknown'])
    expect(invalidDecisionForCorrection({ ...sample.error, code }, diagnostics, contract.schema)).toBeNull();
  expect(invalidDecisionForCorrection(sample.error, { ...diagnostics, truncated: true }, contract.schema)).toBeNull();
  expect(invalidDecisionForCorrection(sample.error, { ...diagnostics, finishReason: 'length' }, contract.schema)).toBeNull();
  expect(invalidDecisionForCorrection(sample.error, { ...diagnostics, finishReason: null }, contract.schema)).toBeNull();
  expect(invalidDecisionForCorrection(sample.error, { ...diagnostics, outputText: '{' }, contract.schema)).toBeNull();
  expect(invalidDecisionForCorrection(sample.error, { ...diagnostics, outputText: JSON.stringify({ action: 'tools', requests: [] }) }, contract.schema)).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

it.each(['native_schema', 'json_validated', 'json_mode'] as const)('%s 同时违反Schema并以length结束时优先截断，不能反馈重试', async mode => {
  let failure: AiSdkGenerationError | undefined;
  try {
    await new AiSdkGenerationAdapter().generate({ requestId: sample.requestId, adapter: 'openai-compatible-chat', providerId: 'fixture',
      baseURL: 'https://offline.invalid/v1', apiKey: '', authMode: 'none', model: 'fixture', messages: messages(),
      contract: contract.ref, schema: contract.schema, mode, transport: 'single', timeout: {}, signal: new AbortController().signal,
      httpClient: async () => new Response(JSON.stringify({ id: 'fixed', object: 'chat.completion', created: 0, model: 'fixture',
        choices: [{ index: 0, message: { role: 'assistant', content: sample.outputText }, finish_reason: 'length' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });
  } catch (error) { failure = error as AiSdkGenerationError; }
  expect(failure?.fact.code).toBe('output_truncated');
  const diagnostics = liveCallFailureDiagnostics(failure, contract.schema, '');
  expect(diagnostics.finishReason).toBe('length');
  expect(invalidDecisionForCorrection(failure!.fact, diagnostics, contract.schema)).toBeNull();
});

it('仅修正结构仍不能绕过实际 T+1，撤保护也不解锁且拒绝不写入原账户', () => {
  const corrected = JSON.parse(sample.outputText); const order = corrected.decision.orders[0];
  order.onFill = null; order.expiresOn = null;
  corrected.decision.cancelOrderIds = account.orders.filter(o => o.side === 'sell' && o.state === 'active').map(o => o.id);
  expect(contract.schema.safeParse(corrected).success).toBe(true);
  const context: ArenaPaperContext = { at: sample.asOf, tradingDate: '2026-11-02', maxPositionBps: protocol.maxPositionBps,
    maxActiveSymbols: protocol.resources.maxActiveSymbols, allowedSymbols: new Set(['510300.SH']), fees: protocol.fees,
    expiresAt: () => '2026-11-02T03:30:00Z', newId: () => 'new-order', quotes: [{ symbol: '510300.SH', price: '4.091',
      marketTime: sample.asOf, observedAt: sample.asOf, sourceRef: 'offline', evidence: {}, tradingDate: '2026-11-02',
      positionAvailableOn: '2026-11-03', cashAvailableOn: '2026-11-02', lot: '100', tick: '0.001',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
  const original = structuredClone(account); let failure: unknown;
  try { arenaSubmitDecision(account, account.revision, corrected.decision, context); } catch (e) { failure = e; }
  expect(failure).toBeInstanceOf(ArenaSellAvailabilityError);
  expect(liveDecisionFeedback(failure, sample.asOf)).toMatchObject({ decisionRejected: { code: 'insufficient_position',
    reason: 'position_not_settled', accountChanged: false, sellAvailability: { availableQuantity: '0', unsettledQuantity: '5000' } } });
  expect(account).toEqual(original);
});
