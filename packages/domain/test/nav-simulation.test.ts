import { describe, expect, it } from 'vitest';
import {
  CnNavSimulation,
  CnNavSimulationError,
  cnTradingCalendar,
  replayCnNavSimulation,
  type CnNavSimulationConfig,
  type CnNavSimulationEvent,
  type SimulationLedgerConfig,
} from '../src/index.js';

const ledgerConfig = (initialCash = '1000'): SimulationLedgerConfig => ({
  executionInstrument: {
    symbol: 'FUND.CN',
    market: 'CN',
    assetType: 'fund',
    currency: 'CNY',
  },
  baseCurrency: 'CNY',
  initialCash: { CNY: initialCash },
});

const config = (initialCash = '1000'): CnNavSimulationConfig => ({
  executionInstrument: {
    symbol: 'FUND.CN',
    market: 'CN',
    assetType: 'fund',
    currency: 'CNY',
  },
  ledgerConfig: ledgerConfig(initialCash),
  calendar: cnTradingCalendar,
  calendarVersion: 'cn-fixture-v1',
  cutoffLocalTime: '15:00',
  timeframe: '1d',
});

const request = (requestId = 'sub-1', requestAt = '2026-09-08T06:00:00Z') => ({
  eventId: `${requestId}:request`,
  requestId,
  requestType: 'subscribe' as const,
  executionSymbol: 'FUND.CN',
  requestAt,
  amount: '100',
  fee: '1',
  occurredAt: requestAt,
  availableAt: requestAt,
});

const subscriptionEvents = (requestId = 'sub-1'): CnNavSimulationEvent[] => [
  { type: 'request', payload: request(requestId) },
  {
    type: 'cutoff',
    payload: {
      eventId: `${requestId}:cutoff`,
      requestId,
      cutoffAt: '2026-09-08T15:00:00+08:00',
      valuationDate: '2026-09-08',
      occurredAt: '2026-09-08T15:00:00+08:00',
      availableAt: '2026-09-08T15:00:00+08:00',
    },
  },
  {
    type: 'nav',
    payload: {
      eventId: `${requestId}:nav`,
      requestId,
      fact: {
        symbol: 'FUND.CN',
        market: 'CN',
        instrumentType: 'NAV_FUND',
        valuationDate: '2026-09-08',
        nav: '10',
        occurredAt: '2026-09-08T23:00:00Z',
        availableAt: '2026-09-09T01:00:00Z',
        provider: 'fixture-provider',
        providerRevision: 'nav-2026-09-08-v1',
        freshness: 'delayed',
        quality: 'complete',
        status: 'supported',
      },
    },
  },
  {
    type: 'confirmation',
    payload: {
      eventId: `${requestId}:confirmation`,
      requestId,
      confirmationDate: '2026-09-09',
      occurredAt: '2026-09-09T02:00:00Z',
      availableAt: '2026-09-09T02:00:00Z',
    },
  },
  {
    type: 'shareAvailable',
    payload: {
      eventId: `${requestId}:shares`,
      requestId,
      shares: '10',
      occurredAt: '2026-09-10T01:00:00Z',
      availableAt: '2026-09-10T01:00:00Z',
    },
  },
  {
    type: 'cashSettlement',
    payload: {
      eventId: `${requestId}:cash`,
      requestId,
      amount: '101',
      occurredAt: '2026-09-10T02:00:00Z',
      availableAt: '2026-09-10T02:00:00Z',
    },
  },
];

describe('CnNavSimulation', () => {
  it('runs the complete subscribe lifecycle without exchange orders or real ledger writes', () => {
    const simulation = new CnNavSimulation(config());
    const results = subscriptionEvents().map((event) => simulation.applyEvent(event));
    expect(results.every((result) => result.applied)).toBe(true);
    expect(simulation.snapshot()).toMatchObject({
      requests: [
        {
          requestId: 'sub-1',
          status: 'settled',
          valuationDate: '2026-09-08',
          nav: '10',
          confirmedShares: '10',
          expectedCashSettlement: '101',
        },
      ],
      ledger: {
        cash: { CNY: { settled: '899', unsettled: '0' } },
        position: { quantity: '10', settledQuantity: '10', unsettledQuantity: '0' },
      },
    });
  });

  it('assigns cutoff-before and cutoff-after requests to deterministic valuation dates', () => {
    const simulation = new CnNavSimulation(config());
    expect(simulation.submitRequest(request('before'))).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'before:cutoff',
          requestId: 'before',
          cutoffAt: '2026-09-08T15:00:00+08:00',
          valuationDate: '2026-09-08',
          occurredAt: '2026-09-08T15:00:00+08:00',
          availableAt: '2026-09-08T15:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(simulation.submitRequest(request('after', '2026-09-08T08:00:00Z'))).toMatchObject({
      applied: true,
    });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'after:cutoff',
          requestId: 'after',
          cutoffAt: '2026-09-08T15:00:00+08:00',
          valuationDate: '2026-09-09',
          occurredAt: '2026-09-08T15:00:00+08:00',
          availableAt: '2026-09-08T15:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(simulation.snapshot().requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: 'before', valuationDate: '2026-09-08' }),
        expect.objectContaining({ requestId: 'after', valuationDate: '2026-09-09' }),
      ]),
    );

    const exactSecond = request('exact-second', '2026-09-08T07:00:59Z');
    expect(simulation.submitRequest(exactSecond)).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'exact-second:cutoff',
          requestId: 'exact-second',
          cutoffAt: '2026-09-08T15:00:00+08:00',
          valuationDate: '2026-09-09',
          occurredAt: '2026-09-08T15:00:00+08:00',
          availableAt: '2026-09-08T15:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: true });
  });

  it('uses the injected calendar for weekend rollover and refuses an early cutoff event', () => {
    const simulation = new CnNavSimulation(config());
    expect(simulation.submitRequest(request('weekend', '2026-09-12T06:00:00Z'))).toMatchObject({
      applied: true,
    });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'weekend:invalid-cutoff',
          requestId: 'weekend',
          cutoffAt: '2026-09-14T15:00:00+08:00',
          valuationDate: '2026-09-14',
          occurredAt: '2026-09-13T15:00:00+08:00',
          availableAt: '2026-09-13T15:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: false, code: 'RULE_REJECTED' });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'weekend:cutoff',
          requestId: 'weekend',
          cutoffAt: '2026-09-14T15:00:00+08:00',
          valuationDate: '2026-09-14',
          occurredAt: '2026-09-14T15:00:00+08:00',
          availableAt: '2026-09-14T15:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: true });
  });

  it('does not consume a future NAV and retries the same event only when it becomes available', () => {
    const simulation = new CnNavSimulation(config());
    const [requestEvent, cutoffEvent, navEvent] = subscriptionEvents();
    simulation.applyEvent(requestEvent);
    simulation.applyEvent(cutoffEvent);
    expect(simulation.applyEvent(navEvent, '2026-09-08T23:30:00Z')).toMatchObject({
      applied: false,
      code: 'NAV_DELAYED',
    });
    expect(simulation.snapshot().requests[0]).toMatchObject({ status: 'pending' });
    const wrongFact = {
      ...navEvent,
      payload: {
        ...navEvent.payload,
        eventId: 'sub-1:wrong-nav',
        fact: { ...navEvent.payload.fact, symbol: 'OTHER.CN' },
      },
    };
    expect(simulation.applyEvent(wrongFact)).toMatchObject({
      applied: false,
      code: 'RULE_REJECTED',
    });
    const staleFact = {
      ...navEvent,
      payload: {
        ...navEvent.payload,
        eventId: 'sub-1:stale-nav',
        fact: { ...navEvent.payload.fact, freshness: 'stale' as const },
      },
    };
    expect(simulation.applyEvent(staleFact)).toMatchObject({
      applied: false,
      code: 'NAV_UNAVAILABLE',
    });
    expect(simulation.applyEvent(navEvent, '2026-09-09T01:00:00Z')).toMatchObject({
      applied: true,
    });
    expect(simulation.applyEvent(navEvent, '2026-09-09T02:00:00Z')).toMatchObject({
      applied: false,
      code: 'DUPLICATE_EVENT',
    });
  });

  it('rejects confirmation, share and cash events that occur before their source is known', () => {
    const simulation = new CnNavSimulation(config());
    const events = subscriptionEvents();
    for (const event of events.slice(0, 3)) simulation.applyEvent(event);
    const earlyConfirmation = {
      ...events[3]!,
      payload: {
        ...events[3]!.payload,
        eventId: 'sub-1:early-confirmation',
        occurredAt: '2026-09-09T00:30:00Z',
        availableAt: '2026-09-09T02:00:00Z',
      },
    };
    expect(simulation.applyEvent(earlyConfirmation)).toMatchObject({
      applied: false,
      code: 'NAV_DELAYED',
    });
    expect(simulation.applyEvent(events[3]!)).toMatchObject({ applied: true });
    const earlyShare = {
      ...events[4]!,
      payload: {
        ...events[4]!.payload,
        eventId: 'sub-1:early-shares',
        occurredAt: '2026-09-09T01:30:00Z',
        availableAt: '2026-09-10T02:00:00Z',
      },
    };
    expect(simulation.applyEvent(earlyShare)).toMatchObject({
      applied: false,
      code: 'NAV_DELAYED',
    });
    const earlyCash = {
      ...events[5]!,
      payload: {
        ...events[5]!.payload,
        eventId: 'sub-1:early-cash',
        occurredAt: '2026-09-09T01:30:00Z',
        availableAt: '2026-09-10T03:00:00Z',
      },
    };
    expect(simulation.applyEvent(earlyCash)).toMatchObject({
      applied: false,
      code: 'NAV_DELAYED',
    });
  });

  it('rejects insufficient settled CNY and unavailable shares stably', () => {
    const cashSimulation = new CnNavSimulation(config('100'));
    expect(cashSimulation.submitRequest({ ...request(), amount: '100', fee: '1' })).toMatchObject({
      applied: false,
      code: 'INSUFFICIENT_CASH',
    });
    const sharesSimulation = new CnNavSimulation(config());
    expect(
      sharesSimulation.submitRequest({
        ...request('redeem-1'),
        requestType: 'redeem',
        amount: undefined,
        shares: '1',
      }),
    ).toMatchObject({ applied: false, code: 'INSUFFICIENT_POSITION' });
  });

  it('redeems only confirmed available shares and settles net cash after fees', () => {
    const simulation = new CnNavSimulation(config());
    for (const event of subscriptionEvents()) simulation.applyEvent(event);
    const redeemRequest = {
      ...request('redeem-1', '2026-09-11T06:00:00Z'),
      requestType: 'redeem' as const,
      amount: undefined,
      shares: '5',
      fee: '2',
    };
    expect(simulation.submitRequest(redeemRequest)).toMatchObject({ applied: true });
    const redeemEvents: CnNavSimulationEvent[] = [
      {
        type: 'cutoff',
        payload: {
          eventId: 'redeem-1:cutoff',
          requestId: 'redeem-1',
          cutoffAt: '2026-09-11T15:00:00+08:00',
          valuationDate: '2026-09-11',
          occurredAt: '2026-09-11T15:00:00+08:00',
          availableAt: '2026-09-11T15:00:00+08:00',
        },
      },
      {
        type: 'nav',
        payload: {
          eventId: 'redeem-1:nav',
          requestId: 'redeem-1',
          fact: {
            symbol: 'FUND.CN',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            valuationDate: '2026-09-11',
            nav: '10.5',
            occurredAt: '2026-09-11T23:00:00Z',
            availableAt: '2026-09-12T01:00:00Z',
            provider: 'fixture-provider',
            providerRevision: 'nav-2026-09-11-v1',
            freshness: 'delayed',
            quality: 'complete',
            status: 'supported',
          },
        },
      },
      {
        type: 'confirmation',
        payload: {
          eventId: 'redeem-1:confirmation',
          requestId: 'redeem-1',
          occurredAt: '2026-09-12T02:00:00Z',
          availableAt: '2026-09-12T02:00:00Z',
        },
      },
      {
        type: 'redemptionCash',
        payload: {
          eventId: 'redeem-1:cash',
          requestId: 'redeem-1',
          amount: '50.5',
          occurredAt: '2026-09-13T02:00:00Z',
          availableAt: '2026-09-13T02:00:00Z',
        },
      },
    ];
    expect(
      simulation.applyEvent({
        ...redeemEvents[3],
        payload: {
          ...redeemEvents[3]!.payload,
          eventId: 'redeem-1:early-cash',
          occurredAt: '2026-09-12T01:30:00Z',
          availableAt: '2026-09-12T03:00:00Z',
        },
      }),
    ).toMatchObject({ applied: false, code: 'NAV_DELAYED' });
    for (const event of redeemEvents)
      expect(simulation.applyEvent(event)).toMatchObject({ applied: true });
    expect(simulation.snapshot()).toMatchObject({
      requests: expect.arrayContaining([
        expect.objectContaining({ requestId: 'redeem-1', status: 'settled' }),
      ]),
      ledger: {
        cash: { CNY: { settled: '949.5', unsettled: '0' } },
        position: { quantity: '5', settledQuantity: '5' },
      },
    });
  });

  it('cancels a pending request once and rejects unsupported NAV instruments', () => {
    const simulation = new CnNavSimulation(config());
    expect(simulation.submitRequest(request('cancel-1'))).toMatchObject({ applied: true });
    const cancel: CnNavSimulationEvent = {
      type: 'cancel',
      payload: {
        eventId: 'cancel-1:cancel',
        requestId: 'cancel-1',
        reason: 'fixture cancellation',
        occurredAt: '2026-09-08T14:30:00Z',
        availableAt: '2026-09-08T14:30:00Z',
      },
    };
    expect(simulation.applyEvent(cancel)).toMatchObject({ applied: true });
    expect(simulation.applyEvent(cancel)).toMatchObject({
      applied: false,
      code: 'DUPLICATE_EVENT',
    });
    expect(
      () =>
        new CnNavSimulation({
          ...config(),
          executionInstrument: { ...config().executionInstrument, market: 'HK' },
        }),
    ).toThrow(CnNavSimulationError);
  });

  it('replays an isolated NAV event sequence deterministically', () => {
    const first = replayCnNavSimulation(config(), subscriptionEvents());
    const second = replayCnNavSimulation(config(), subscriptionEvents());
    expect(first.state).toEqual(second.state);
    expect(first.results).toEqual(second.results);
  });
});
