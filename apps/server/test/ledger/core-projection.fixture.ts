import { vi } from 'vitest';
import type { StoredCashEvent } from '../../src/ledger/cash-projection.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const strategyId = '22222222-2222-4222-8222-222222222222';

export const fakeCoreClient = (events: StoredCashEvent[], method: 'AVG' | 'FIFO' = 'AVG') => ({
  account: {
    findUnique: vi.fn(async () => ({
      id: accountId,
      mode: 'actual',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })),
  },
  accountCostStrategyVersion: {
    findMany: vi.fn(async () => [
      {
        id: strategyId,
        accountId,
        revision: 1,
        method,
        effectiveAt: new Date('2025-01-01T00:00:00.000Z'),
        reason: 'test',
        actorId: 'test',
      },
    ]),
    create: vi.fn(),
  },
  accountLedgerState: {
    findUnique: vi.fn(),
  },
  ledgerEvent: {
    findMany: vi.fn(async () => events),
  },
  position: {
    findMany: vi.fn(async () => []),
    update: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  },
  trade: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  tradeEntryLeg: { create: vi.fn() },
  tradeBaselineComponent: { create: vi.fn() },
  tradeCorporateActionAdjustment: { create: vi.fn() },
  tradeCloseSlice: { create: vi.fn() },
  tradeCloseAllocation: { create: vi.fn() },
  tradeDividendAttribution: { create: vi.fn() },
  tradeEvidenceSource: { create: vi.fn() },
  cashBalance: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  cashSettlement: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
});
