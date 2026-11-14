import { describe, expect, it, vi } from 'vitest';
import { DataQualityService } from '../../src/quality/data-quality.service.js';
import { StructuredLogger } from '../../src/platform/structured-logger.js';

const input = {
  capability: 'REALTIME_QUOTE',
  provider: 'dsa',
  symbol: '600000.SH',
  code: 'response_schema_invalid' as const,
};

function setup(existing: unknown = null, updated = 1) {
  const tx = {
    $executeRaw: vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>>(async () => 1),
    dataQualityIssue: {
      findFirst: vi.fn(async () => existing),
      create: vi.fn<(input: { data: { details: Record<string, unknown>; detectedAt: Date } }) => Promise<{ id: string }>>(
        async () => ({
          id: 'new-issue',
        }),
      ),
      updateMany: vi.fn<(input: { data: { details: Record<string, unknown> } }) => Promise<{ count: number }>>(async () => ({
        count: updated,
      })),
    },
  };
  const prisma = { $transaction: vi.fn(async (work: (value: typeof tx) => unknown) => work(tx)) };
  return { tx, service: new DataQualityService(prisma as never) };
}

describe('自动质量观察记录', () => {
  it('首次记录只写允许的摘要字段，持久化完整标的和首次时间', async () => {
    const { service, tx } = setup();
    expect(await service.observe(input)).toEqual({
      id: 'new-issue',
      created: true,
      occurrences: 1,
    });
    const data = tx.dataQualityIssue.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      ...input,
      severity: 'error',
      details: { occurrences: 1, message: '来源返回的数据格式或数值未通过校验' },
    });
    expect(Object.keys(data.details).sort()).toEqual([
      'fingerprint',
      'firstSeenAt',
      'lastSeenAt',
      'message',
      'occurrences',
    ]);
    expect(data.details.firstSeenAt).toBe(data.detectedAt.toISOString());
  });

  it('重复问题增加次数，已确认状态和首次时间保持不变', async () => {
    const { service, tx } = setup({
      id: 'old',
      status: 'acknowledged',
      detectedAt: new Date('2026-11-01T00:00:00Z'),
      details: { occurrences: 3 },
    });
    expect(await service.observe(input)).toEqual({ id: 'old', created: false, occurrences: 4 });
    expect(tx.dataQualityIssue.create).not.toHaveBeenCalled();
    const update = tx.dataQualityIssue.updateMany.mock.calls[0]![0];
    expect(update.data).toEqual({
      details: expect.objectContaining({ occurrences: 4, firstSeenAt: '2026-11-01T00:00:00.000Z' }),
    });
    expect(update.data).not.toHaveProperty('status');
  });

  it('观察与关闭并发时，已关闭记录不被覆盖，重新发生创建新记录', async () => {
    const { service, tx } = setup(
      { id: 'closed', detectedAt: new Date(), details: { occurrences: 9 } },
      0,
    );
    expect(await service.observe(input)).toMatchObject({ created: true, occurrences: 1 });
    expect(tx.dataQualityIssue.create.mock.calls[0]?.[0]?.data.details.occurrences).toBe(1);
  });

  it('不同市场、来源或请求范围使用不同的合并锁', async () => {
    const { service, tx } = setup();
    for (const value of [
      input,
      { ...input, symbol: '600000.HK' },
      { ...input, provider: 'other' },
      { ...input, scope: 'adjusted' },
    ])
      await service.observe(value);
    expect(new Set(tx.$executeRaw.mock.calls.map((call) => call[1])).size).toBe(4);
  });

  it('数据库失败只发安全告警，不抛出底层错误或原文', async () => {
    const warn = vi.spyOn(StructuredLogger.prototype, 'warn').mockImplementation(() => {});
    const service = new DataQualityService({
      $transaction: async () => {
        throw new Error('password=private');
      },
    } as never);
    await expect(service.observe(input)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith({
      operation: 'data_quality.persist_failed',
      code: input.code,
    });
    warn.mockRestore();
  });
});
