import { describe, expect, it, vi } from 'vitest';
import { frozenSnapshotInputs, readCurrentSnapshotInputs } from '../../src/performance/performance-snapshot-inputs.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { PerformanceDataService } from '../../src/performance/performance-data.service.js';

describe('盈亏历史冻结账户范围', () => {
  it('账户没有现金流水时也冻结完整范围，正式修订继续消费同一范围', async () => {
    const accountIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const prisma = { position: { findMany: vi.fn().mockResolvedValue([]) }, ledgerEvent: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaService;
    const data = { accountCurrencies: vi.fn().mockResolvedValue(new Map(accountIds.map(id => [id, 'CNY']))) } as unknown as PerformanceDataService;
    const inputs = await readCurrentSnapshotInputs(prisma, data, undefined, new Date('2026-11-04T08:00:00Z'), 'actual');
    expect(inputs.accountIds).toEqual(accountIds);
    const restored = frozenSnapshotInputs({ baseCurrency: 'CNY', disclosureCoverage: 1,
      payload: { accountIds: inputs.accountIds, accountScopePolicy: inputs.accountScopePolicy, positions: [], cashByCurrency: [] } });
    expect(restored.accountIds).toEqual(accountIds);
  });
});
