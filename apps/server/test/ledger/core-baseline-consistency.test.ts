import { describe, expect, it } from 'vitest';
import { rebuildCoreProjections } from '../../src/ledger/core-projection.js';
import type { StoredCashEvent } from '../../src/ledger/cash-projection.js';
import { fakeCoreClient } from './core-projection.fixture.js';
import { storedV2Event } from './ledger-event-fixtures.js';

const accountId = '11111111-1111-4111-8111-111111111111';

const observation = (
  id: string,
  quantity: string,
  occurredAt: string,
  revision: number,
): StoredCashEvent =>
  ({
    ...storedV2Event({
      id,
      accountId,
      type: 'POSITION_BASELINE_OBSERVATION',
      occurredAt,
      ledgerRevision: revision,
      payload: {
        symbol: '600000.SH',
        batchId: '33333333-3333-4333-8333-333333333333',
        batchScope: 'PARTIAL',
        quantity,
        averageCost: '8',
        currency: 'CNY',
        costIncludesFees: 'UNKNOWN',
      },
    }),
    timePrecision: occurredAt.length === 10 ? 'DATE' : 'INSTANT',
    sourceTimezone: 'Asia/Shanghai',
  }) as StoredCashEvent;

describe('乱序观察的核心物化投影', () => {
  it.each(['AVG', 'FIFO'] as const)(
    '%s 的数量、成本及 Trade 余量采用相同检查点',
    async (method) => {
      const events = [
        observation('day-19', '3', '2026-10-19', 2),
        observation('day-21-first', '3', '2026-10-21T09:33:42.763Z', 3),
        observation('day-21-second', '3', '2026-10-21T09:41:36.447Z', 4),
        observation('day-20-late', '9', '2026-10-20', 6),
      ];
      const before = structuredClone(events);
      const client = fakeCoreClient(events, method);
      const result = await rebuildCoreProjections(client as never, accountId, {
        method,
        projectionGeneration: 9n,
      });

      expect(result.positions).toEqual([
        { accountId, symbol: '600000.SH', quantity: '3', averageCost: '8', realizedPnl: '0' },
      ]);
      const position = client.position.create.mock.calls[0]?.[0] as unknown as {
        data: { quantity: { toString(): string }; costPrice: { toString(): string } };
      };
      expect(position.data.quantity.toString()).toBe('3');
      expect(position.data.costPrice.toString()).toBe('8');
      expect(client.trade.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          remainingQuantity: expect.objectContaining({ toString: expect.any(Function) }),
          completeness: 'CONFLICTED',
          issues: expect.arrayContaining(['QUANTITY_CONFLICT']),
        }),
      });
      expect(client.tradeCloseSlice.create).not.toHaveBeenCalled();
      expect(client.cashBalance.create).not.toHaveBeenCalled();
      expect(events).toEqual(before);
    },
  );
});
