import { describe, expect, it, vi } from 'vitest';
import { AuthoringOperationRepository } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { AuthoringProvenanceRepository } from '../../src/strategy-authoring/authoring-provenance.repository.js';
import type { AuthoringDatabase } from '../../src/strategy-authoring/authoring-store.js';

const id = '11111111-1111-4111-8111-111111111111';
const cost = {
  status: 'unknown',
  amount: null,
  currency: null,
  source: null,
  pricingVersion: null,
};
const input = {
  kind: 'analyze',
  expectedRevision: 1,
  idempotencyKey: 'intent-1',
  providerId: 'selected',
  model: 'chosen',
  promptVersion: 'nl-v1',
  capabilityVersion: 'authoring-v1',
  cost,
  unknownCostAcknowledgedAt: '2026-10-04T01:00:00Z',
  intent: '',
};
const fixture = () => {
  const query = vi.fn().mockResolvedValue([]);
  const execute = vi.fn().mockResolvedValue(1);
  const transaction = vi.fn(async (work) => work({ $queryRaw: query, $executeRaw: execute }));
  const db = { $transaction: transaction } as unknown as AuthoringDatabase;
  return {
    operation: new AuthoringOperationRepository(db),
    provenance: new AuthoringProvenanceRepository(db),
    query,
    execute,
    transaction,
  };
};
describe('编写操作与来源的前置边界', () => {
  it('未知费用未确认不能提交', async () => {
    const f = fixture();
    await expect(async () =>
      f.operation.submit('alice', id, { ...input, unknownCostAcknowledgedAt: null }),
    ).rejects.toThrow();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('越权读取和领取不透露操作', async () => {
    const f = fixture();
    await expect(f.operation.read('bob', id)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(f.operation.claim('bob', id)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(f.provenance.readSource('bob', id)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
  });
  it('已结束草稿不接收新操作', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce([{ id, state: 'discarded', revision: 1 }])
      .mockResolvedValueOnce([]);
    await expect(f.operation.submit('alice', id, input)).rejects.toMatchObject({
      response: { code: 'AUTHORING_CLOSED' },
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('同幂等键变更模型被拒绝', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce([{ id, state: 'editing', revision: 1 }])
      .mockResolvedValueOnce([{ fingerprint: 'different' }]);
    await expect(f.operation.submit('alice', id, input)).rejects.toMatchObject({
      response: { code: 'AUTHORING_IDEMPOTENCY_CONFLICT' },
    });
  });
  it('成功结果必须实际收到，失败必须记录稳定错误', async () => {
    const f = fixture();
    for (const status of ['succeeded', 'failed'])
      await expect(async () =>
        f.operation.finish('alice', id, {
          status,
          attempt: 1,
          externalResult: 'unknown',
          outputText: null,
          errorCode: null,
          usage: null,
          cost,
        }),
      ).rejects.toThrow();
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
