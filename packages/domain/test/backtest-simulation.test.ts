import { describe, expect, it, vi } from 'vitest';
import {
  DeterministicSimulationEngine,
  SimulationEventQueue,
  createSimulationEvent,
  evaluateBooleanExpression,
  evaluateSignalAt,
  type SimulationEngineInput,
} from '../src/index.js';

const point = (date: string, value: string, availableAt = `${date}T00:00:00Z`) => ({
  occurredAt: `${date}T00:00:00Z`,
  availableAt,
  value,
  status: 'available' as const,
});

const sourceSeries = (points: ReturnType<typeof point>[]) => ({
  sourceId: 'close',
  symbol: '600519.SH',
  market: 'CN' as const,
  assetType: 'stock' as const,
  field: 'close' as const,
  timeframe: '1d' as const,
  adjusted: false,
  points,
});

const compare = (operator: 'eq' | 'gt' | 'lt', right: string) => ({
  type: 'compare' as const,
  operator,
  left: { type: 'series' as const, sourceId: 'close', field: 'close' as const },
  right: { type: 'constant' as const, value: right },
});

const strategy = (entry = compare('gt', '10')) => ({
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
  entry,
  exit: compare('lt', '0'),
});

const baseInput = (overrides: Partial<SimulationEngineInput> = {}): SimulationEngineInput => ({
  runId: 'run-1',
  strategy: strategy(),
  ticks: [{ occurredAt: '2025-01-01T00:00:00Z' }],
  sourceSeries: new Map([['close', sourceSeries([point('2025-01-01', '11')])]]),
  ...overrides,
});

describe('deterministic simulation events', () => {
  it('orders same-time events by phase and stable sequence', () => {
    const queue = new SimulationEventQueue();
    const signal = createSimulationEvent({
      runId: 'run',
      sequence: 2,
      type: 'signalEvaluation',
      phase: 'RiskSignalEvaluation',
      occurredAt: '2025-01-01T00:00:00Z',
      payload: {},
    });
    const session = createSimulationEvent({
      runId: 'run',
      sequence: 9,
      type: 'sessionState',
      phase: 'SessionSettlementState',
      occurredAt: '2025-01-01T00:00:00Z',
      payload: {},
    });
    queue.enqueue(signal);
    queue.enqueue(session);
    expect(queue.drain().map((event) => event.type)).toEqual(['sessionState', 'signalEvaluation']);
  });

  it('uses Decimal comparisons, preserves unavailable, and rejects future facts', () => {
    const input = baseInput({
      sourceSeries: new Map([
        ['close', sourceSeries([point('2025-01-01', '10.00', '2025-01-01T01:00:00Z')])],
      ]),
    });
    const context = {
      tick: { occurredAt: '2025-01-01T00:00:00Z' },
      sourceSeries: input.sourceSeries,
    };
    expect(evaluateBooleanExpression(compare('eq', '10'), context)).toMatchObject({
      status: 'unavailable',
    });
    const result = new DeterministicSimulationEngine().run(input);
    expect(result.signals).toHaveLength(0);
    expect(result.rejects).toMatchObject([
      { code: 'FUTURE_DATA', ruleVersion: 'simulation-time-v1' },
    ]);
  });

  it('evaluates only the declared primary timeframe clock', () => {
    const result = new DeterministicSimulationEngine().run(
      baseInput({
        ticks: [
          { occurredAt: '2025-01-01T00:00:00Z', timeframe: '5m' },
          { occurredAt: '2025-01-01T00:00:00Z', timeframe: '1d' },
        ],
      }),
    );
    expect(result.events.filter((event) => event.type === 'signalEvaluation')).toHaveLength(1);
  });

  it('does not change an earlier result when a later point is appended', () => {
    const initial = baseInput();
    const withFuturePoint = baseInput({
      sourceSeries: new Map([
        ['close', sourceSeries([point('2025-01-01', '11'), point('2025-01-02', '100')])],
      ]),
    });
    const first = new DeterministicSimulationEngine().run(initial);
    const second = new DeterministicSimulationEngine().run(withFuturePoint);
    expect(second.signals).toEqual(first.signals);
    expect(second.rejects).toEqual(first.rejects);
  });

  it('emits only a false-to-true edge and does not turn unavailable into false', () => {
    const input = baseInput();
    const state = evaluateSignalAt(input, { occurredAt: '2025-01-01T00:00:00Z' }, {}, 1);
    expect(state.signal?.kind).toBe('entry');
    const unavailableInput = baseInput({
      sourceSeries: new Map([
        [
          'close',
          sourceSeries([{ ...point('2025-01-02', '11'), status: 'unavailable', value: undefined }]),
        ],
      ]),
    });
    const next = evaluateSignalAt(
      unavailableInput,
      { occurredAt: '2025-01-02T00:00:00Z' },
      state.state,
      2,
    );
    expect(next.entry.status).toBe('unavailable');
    expect(next.state.entry).toBe(true);
    expect(next.signal).toBeUndefined();
  });

  it('replays the complete signal-to-fill chain deterministically and mutates only on fill', () => {
    const onMutation = vi.fn();
    const execution = {
      toOrder: (
        intent: Parameters<NonNullable<SimulationEngineInput['execution']>['toOrder']>[0],
      ) => ({
        ...intent,
        orderId: `${intent.intentId}:order`,
      }),
      validateOrder: () => ({ accepted: true as const, ruleVersion: 'rules-1' }),
      createFill: (
        order: Parameters<NonNullable<SimulationEngineInput['execution']>['createFill']>[0],
      ) => ({
        fillId: `${order.orderId}:fill`,
        orderId: order.orderId,
        executionSymbol: order.executionSymbol,
        side: order.side,
        quantity: '1',
        price: '10.00',
        charges: [],
        occurredAt: order.occurredAt,
        availableAt: order.availableAt,
        reason: order.reason,
      }),
      onMutation,
    };
    const input = baseInput({ execution });
    const first = new DeterministicSimulationEngine().run(input);
    const second = new DeterministicSimulationEngine().run(input);
    expect(first.events.map((event) => event.type)).toEqual([
      'signalEvaluation',
      'targetIntent',
      'orderValidation',
      'simulationFill',
    ]);
    expect(first.events.map((event) => event.eventId)).toEqual(
      second.events.map((event) => event.eventId),
    );
    expect(first.fills).toHaveLength(1);
    expect(first.mutations).toHaveLength(1);
    expect(onMutation).toHaveBeenCalledTimes(2);

    const noExecution = new DeterministicSimulationEngine().run(baseInput());
    expect(noExecution.mutations).toEqual([]);
  });

  it('preserves delayed settlement identity and emits it exactly once after a fill', () => {
    const settlementAt = '2025-01-03T00:00:00Z';
    const onMutation = vi.fn();
    const result = new DeterministicSimulationEngine().run(
      baseInput({
        execution: {
          toOrder: (intent) => ({ ...intent, orderId: `${intent.intentId}:order` }),
          validateOrder: () => ({ accepted: true, ruleVersion: 'rules-1' }),
          createFill: (order) => ({
            fillId: `${order.orderId}:fill`,
            orderId: order.orderId,
            executionSymbol: order.executionSymbol,
            side: order.side,
            quantity: '1',
            price: '10.00',
            charges: [],
            occurredAt: order.occurredAt,
            availableAt: order.availableAt,
            reason: order.reason,
          }),
          scheduledMutationsForFill: () => [
            {
              type: 'cashSettlement',
              eventId: 'settlement:event:1',
              occurredAt: settlementAt,
              availableAt: settlementAt,
              payload: { settlementId: 'settlement-1' },
            },
            {
              type: 'cashSettlement',
              eventId: 'settlement:event:1',
              occurredAt: settlementAt,
              availableAt: settlementAt,
              payload: { settlementId: 'settlement-1' },
            },
          ],
          onMutation,
        },
      }),
    );

    expect(result.events.filter((event) => event.type === 'cashSettlement')).toMatchObject([
      { eventId: 'settlement:event:1', availableAt: settlementAt },
    ]);
    expect(result.mutations.filter((mutation) => mutation.type === 'cashSettlement')).toEqual([
      {
        type: 'cashSettlement',
        eventId: 'settlement:event:1',
        payload: { settlementId: 'settlement-1' },
      },
    ]);
    expect(onMutation).toHaveBeenCalledTimes(2);
  });

  it('completes tick one fill before evaluating tick two position-dependent risk', () => {
    const position = {
      isOpen: false,
      quantity: '0',
      averageCost: '0',
      holdingPeriods: 0,
      availableAt: '2025-01-01T00:00:00Z',
    };
    const execution = {
      toOrder: (
        intent: Parameters<NonNullable<SimulationEngineInput['execution']>['toOrder']>[0],
      ) => ({
        ...intent,
        orderId: `${intent.intentId}:order`,
      }),
      validateOrder: () => ({ accepted: true as const, ruleVersion: 'rules-1' }),
      createFill: (
        order: Parameters<NonNullable<SimulationEngineInput['execution']>['createFill']>[0],
      ) => ({
        fillId: `${order.orderId}:fill`,
        orderId: order.orderId,
        executionSymbol: order.executionSymbol,
        side: order.side,
        quantity: '1',
        price: '10.00',
        charges: [],
        occurredAt: order.occurredAt,
        availableAt: order.availableAt,
        reason: order.reason,
      }),
      onMutation: (command: { payload: Record<string, unknown> }) => {
        const fill = command.payload as { side?: 'buy' | 'sell' };
        position.isOpen = fill.side === 'buy';
      },
    };
    const result = new DeterministicSimulationEngine().run(
      baseInput({
        ticks: [{ occurredAt: '2025-01-01T00:00:00Z' }, { occurredAt: '2025-01-02T00:00:00Z' }],
        sourceSeries: new Map([
          ['close', sourceSeries([point('2025-01-01', '11'), point('2025-01-02', '11')])],
        ]),
        positionStateAt: () => position,
        risk: (context) => ({
          status: 'available',
          value: context.positionState?.isOpen ?? false,
          occurredAt: context.tick.occurredAt,
          availableAt: context.tick.occurredAt,
        }),
        execution,
      }),
    );
    const tickTwoEvaluationIndex = result.events.findIndex(
      (event) =>
        event.type === 'signalEvaluation' &&
        (event.payload as { tick: { occurredAt: string } }).tick.occurredAt ===
          '2025-01-02T00:00:00Z',
    );
    const tickOneFillIndex = result.events.findIndex(
      (event) =>
        event.type === 'simulationFill' &&
        (event.payload as { occurredAt: string }).occurredAt === '2025-01-01T00:00:00Z',
    );
    expect(tickOneFillIndex).toBeGreaterThanOrEqual(0);
    expect(tickOneFillIndex).toBeLessThan(tickTwoEvaluationIndex);
    expect(result.signals.map((signal) => signal.kind)).toEqual(['entry', 'risk']);
  });

  it('schedules fill settlements with the supplied stable event id and future ordering', () => {
    const mutations: string[] = [];
    const execution = {
      toOrder: (
        intent: Parameters<NonNullable<SimulationEngineInput['execution']>['toOrder']>[0],
      ) => ({ ...intent, orderId: `${intent.intentId}:order` }),
      validateOrder: () => ({ accepted: true as const, ruleVersion: 'rules-1' }),
      createFill: (
        order: Parameters<NonNullable<SimulationEngineInput['execution']>['createFill']>[0],
      ) => ({
        fillId: `${order.orderId}:fill`,
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
      scheduledMutationsForFill: () => [
        {
          type: 'cashSettlement' as const,
          eventId: 'stable:settlement',
          occurredAt: '2025-01-01T00:00:00Z',
          availableAt: '2025-01-03T00:00:00Z',
          payload: { sourceEventId: 'fill:source', availableAt: '2025-01-03T00:00:00Z' },
        },
      ],
      onMutation: (command: { type: string; eventId: string }) =>
        mutations.push(`${command.type}:${command.eventId}`),
    };
    const result = new DeterministicSimulationEngine().run(baseInput({ execution }));
    expect(result.events.at(-1)?.eventId).toBe('stable:settlement');
    expect(mutations).toContain('cashSettlement:stable:settlement');
  });
});

describe('simulation queue lifecycle', () => {
  it('makes cancel and retry idempotent', () => {
    const queue = new SimulationEventQueue();
    const event = createSimulationEvent({
      runId: 'run',
      sequence: 1,
      type: 'resultEmission',
      phase: 'ResultEmission',
      occurredAt: '2025-01-01T00:00:00Z',
      payload: {},
    });
    expect(queue.enqueue(event)).toBe(true);
    expect(queue.enqueue(event)).toBe(false);
    expect(queue.retry(event.eventId)).toBe(true);
    expect(queue.cancel(event.eventId)).toBe(true);
    expect(queue.cancel(event.eventId)).toBe(false);
    expect(queue.retry(event.eventId)).toBe(false);
    expect(queue.drain()).toEqual([]);
  });

  it('schedules delayed NAV confirmation and settlement at their consumable time', () => {
    const queue = new SimulationEventQueue();
    const nav = createSimulationEvent({
      runId: 'run',
      sequence: 1,
      type: 'navConfirmation',
      phase: 'NavConfirmationSettlement',
      occurredAt: '2025-01-01T10:00:00Z',
      availableAt: '2025-01-02T10:00:00Z',
      payload: { id: 'nav-1' },
    });
    const settlement = createSimulationEvent({
      runId: 'run',
      sequence: 2,
      type: 'cashSettlement',
      phase: 'NavConfirmationSettlement',
      occurredAt: '2025-01-01T10:00:00Z',
      availableAt: '2025-01-02T10:00:00Z',
      payload: { id: 'cash-1' },
    });
    queue.enqueue(settlement);
    queue.enqueue(nav);
    expect(queue.nextEligibleEvent('2025-01-01T12:00:00Z')).toBeUndefined();
    expect(queue.nextEligibleEvent('2025-01-02T12:00:00Z')?.type).toBe('navConfirmation');
    expect(queue.drain().map((event) => event.type)).toEqual(['navConfirmation', 'cashSettlement']);
    expect(nav.eventId).toBe(
      createSimulationEvent({
        runId: 'run',
        sequence: 1,
        type: 'navConfirmation',
        phase: 'NavConfirmationSettlement',
        occurredAt: '2025-01-01T10:00:00Z',
        availableAt: '2025-01-02T10:00:00Z',
        payload: { id: 'nav-1' },
      }).eventId,
    );
  });
});
