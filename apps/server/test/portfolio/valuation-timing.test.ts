import { describe, expect, it, vi } from 'vitest';
import { PortfolioService } from '../../src/portfolio/portfolio.service.js';
import { StructuredLogger } from '../../src/platform/structured-logger.js';

describe('组合估值阶段证据', () => {
  it('记录可关联的阶段、范围和耗时，不记录金额', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const logger = vi
      .spyOn(StructuredLogger.prototype, 'log')
      .mockImplementation((record) => logs.push(record as Record<string, unknown>));
    const service = new PortfolioService(
      {
        position: { findMany: vi.fn(async () => []) },
        account: { findMany: vi.fn(async () => []) },
        ledgerEvent: { findMany: vi.fn(async () => []) },
      } as never,
      {} as never,
    );

    await service.value('account-1', 'actual');

    logger.mockRestore();
    const valuationLogs = logs.filter((record) => record.operation === 'portfolio.valuation');
    expect(valuationLogs.map((record) => record.stage)).toEqual([
      'positions+account-currencies',
      'realized-pnl',
      'position-valuation',
      'cash-materialization',
      'fx',
      'aggregation-total',
    ]);
    for (const record of valuationLogs) {
      expect(record).toMatchObject({
        traceId: 'unknown',
        accountId: 'account-1',
        mode: 'actual',
      });
      expect(record.durationMs).toEqual(expect.any(Number));
      expect(record.totalDurationMs).toEqual(expect.any(Number));
      expect(record).not.toHaveProperty('amount');
      expect(record).not.toHaveProperty('value');
    }
  });
});
