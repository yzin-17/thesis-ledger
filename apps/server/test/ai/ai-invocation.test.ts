import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aiInvocationFactSchema, aiInvocationPreparationSchema } from '@thesis-ledger/schemas';
import { canAppendInvocationFact } from '../../src/ai/ai-invocation-policy.js';

const cost = { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null };
const base = { eventKey: randomUUID(), kind: 'dispatching', actualModel: null, usage: null, cost,
  errorCode: null, outputFingerprint: null };
describe('调用事实边界', () => {
  it('结果未知保留派发事实，晚到完成可追加且终态不可再派发', () => {
    expect(canAppendInvocationFact(null, 'received')).toBe(false);
    expect(canAppendInvocationFact(null, 'dispatching')).toBe(true);
    expect(canAppendInvocationFact('dispatching', 'unknown')).toBe(true);
    expect(canAppendInvocationFact('unknown', 'received')).toBe(true);
    expect(canAppendInvocationFact('unknown', 'not_sent')).toBe(false);
    for (const previous of ['not_sent', 'received'] as const)
      for (const next of ['dispatching', 'not_sent', 'unknown', 'received'] as const)
        expect(canAppendInvocationFact(previous, next)).toBe(false);
  });
  it('未发送与派发阶段不能伪造用量、费用或输出', () => {
    expect(aiInvocationFactSchema.safeParse(base).success).toBe(true);
    for (const kind of ['dispatching', 'not_sent']) {
      expect(aiInvocationFactSchema.safeParse({ ...base, kind, usage: { status: 'reported', inputTokens: 1, outputTokens: 2 } }).success).toBe(false);
      expect(aiInvocationFactSchema.safeParse({ ...base, kind, actualModel: 'unobserved' }).success).toBe(false);
      expect(aiInvocationFactSchema.safeParse({ ...base, kind, cost: { status: 'known', amount: '0', currency: 'USD', source: 'fake', pricingVersion: null } }).success).toBe(false);
    }
    expect(aiInvocationFactSchema.safeParse({ ...base, kind: 'unknown', outputFingerprint: 'a'.repeat(64) }).success).toBe(false);
  });
  it('未知费用不冒充零元或已知币种，结构不接收秘密及任意响应文本', () => {
    for (const change of [{ amount: '0' }, { currency: 'USD' }, { source: 'inferred' }])
      expect(aiInvocationFactSchema.safeParse({ ...base, cost: { ...cost, ...change } }).success).toBe(false);
    expect(aiInvocationFactSchema.safeParse({ ...base, apiKey: 'must-not-persist' }).success).toBe(false);
    expect(aiInvocationFactSchema.safeParse({ ...base, rawResponse: 'arbitrary-provider-response' }).success).toBe(false);
  });
  it('业务引用与 attempt 固定，身份和摘要必须符合合同', () => {
    const prepared = { requestId: randomUUID(), consumer: 'strategy_authoring', referenceId: randomUUID(),
      ownerId: randomUUID(), executionAttempt: 1, providerId: 'selected', requestedModel: 'chosen', inputFingerprint: 'a'.repeat(64) };
    expect(aiInvocationPreparationSchema.safeParse(prepared).success).toBe(true);
    for (const change of [{ executionAttempt: 0 }, { ownerId: 'self-reported-name' }, { inputFingerprint: 'raw-input' }, { apiKey: 'must-not-persist' }])
      expect(aiInvocationPreparationSchema.safeParse({ ...prepared, ...change }).success).toBe(false);
  });
});
