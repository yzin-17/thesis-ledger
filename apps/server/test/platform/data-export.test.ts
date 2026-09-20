import { describe, expect, it, vi } from 'vitest';
import { DataExportService } from '../../src/platform/data-export.service.js';

describe('策略结果导出门禁', () => {
  it('现有账户导出不旁路携带回测产物，并声明揭示限制码', async () => {
    const findMany = vi.fn(async () => []);
    const service = new DataExportService({
      account: { findMany },
      ledgerEvent: { findMany },
      position: { findMany },
      journalEntry: { findMany },
      tradePlan: { findMany },
      strategy: { findMany },
      riskRule: { findMany },
      riskEvent: { findMany },
      notificationDelivery: { findMany },
    } as never);

    const exported = await service.exportAccount();
    expect(exported.data).not.toHaveProperty('backtestJobs');
    expect(exported.data).not.toHaveProperty('optimizationExperiments');
    expect(exported.omitted).toEqual(
      expect.arrayContaining([
        'BACKTEST_RESULTS_REQUIRES_REVEAL',
        'OPTIMIZATION_TEST_RESULTS_REQUIRES_REVEAL',
      ]),
    );
  });
});
