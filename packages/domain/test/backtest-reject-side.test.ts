import { describe, expect, it } from 'vitest';
import { runDeterministicSimulation, type SimulationEngineInput } from '../src/index.js';

const signalRule = {
  type: 'compare' as const,
  operator: 'gt' as const,
  left: { type: 'series' as const, sourceId: 'close', field: 'close' as const },
  right: { type: 'constant' as const, value: '0' },
};

const inputFor = (
  isOpen: boolean,
  execution: NonNullable<SimulationEngineInput['execution']>,
): SimulationEngineInput => ({
  runId: `reject-side-${isOpen ? 'sell' : 'buy'}`,
  strategy: {
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: signalRule,
    exit: signalRule,
  },
  ticks: [{ occurredAt: '2025-01-01T00:00:00Z' }],
  sourceSeries: new Map([
    [
      'close',
      {
        sourceId: 'close',
        symbol: '600519.SH',
        market: 'CN',
        assetType: 'stock',
        field: 'close',
        timeframe: '1d',
        adjusted: false,
        points: [
          {
            occurredAt: '2025-01-01T00:00:00Z',
            availableAt: '2025-01-01T00:00:00Z',
            value: '11',
            status: 'available' as const,
          },
        ],
      },
    ],
  ]),
  positionState: {
    isOpen,
    quantity: isOpen ? '1' : '0',
    averageCost: isOpen ? '10' : '0',
    holdingPeriods: isOpen ? 1 : 0,
    availableAt: '2025-01-01T00:00:00Z',
  },
  execution,
});

const orderExecution = {
  toOrder: (intent: Parameters<NonNullable<SimulationEngineInput['execution']>['toOrder']>[0]) => ({
    ...intent,
    orderId: `${intent.side}:order-1`,
  }),
  validateOrder: () => ({
    accepted: false as const,
    code: 'DAY_EXPIRED',
    reason: 'no next eligible bar',
  }),
};

describe('SimulationReject side', () => {
  it.each([
    { side: 'buy' as const, isOpen: false },
    { side: 'sell' as const, isOpen: true },
  ])('retains the originating $side order direction', ({ side, isOpen }) => {
    const result = runDeterministicSimulation(inputFor(isOpen, orderExecution));

    expect(result.rejects).toMatchObject([
      {
        rejectionId: `reject-side-${side}:reject:${side}:order-1`,
        orderId: `${side}:order-1`,
        side,
        code: 'DAY_EXPIRED',
        reason: 'no next eligible bar',
        occurredAt: '2025-01-01T00:00:00Z',
      },
    ]);
  });

  it('retains direction from the rejected fill when ledger publication fails', () => {
    const result = runDeterministicSimulation(
      inputFor(false, {
        toOrder: orderExecution.toOrder,
        validateOrder: () => ({ accepted: true }),
        createFill: (order) => ({
          fillId: `${order.orderId}:fill-1`,
          orderId: order.orderId,
          executionSymbol: order.executionSymbol,
          side: order.side,
          quantity: '1',
          price: '10',
          charges: [],
          occurredAt: order.occurredAt,
          availableAt: order.availableAt,
          reason: order.reason,
        }),
        applyMutation: () => ({ accepted: false, reason: 'ledger rejected fill' }),
      }),
    );

    expect(result.rejects).toMatchObject([
      {
        orderId: 'buy:order-1',
        side: 'buy',
        code: 'LEDGER_REJECTED',
        reason: 'ledger rejected fill',
      },
    ]);
    expect(result.fills).toEqual([]);
  });
});
