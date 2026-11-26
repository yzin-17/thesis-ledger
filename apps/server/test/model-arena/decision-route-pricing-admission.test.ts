import { beforeEach, expect, it, vi } from 'vitest';
import { ArenaModelDecisions } from '../../src/model-arena/arena-model-decisions.js';

const locks = vi.hoisted(() => ({ lock: vi.fn(), settle: vi.fn() }));
vi.mock('../../src/model-arena/model-arena.repository.js', () => ({ lockArena: locks.lock }));
vi.mock('../../src/model-arena/arena-settlement.js', () => ({ settleReservation: locks.settle }));
beforeEach(() => vi.resetAllMocks());

it.each(['runtime', 'currency', 'price', 'upstream', 'input'] as const)(
  '决策路由 %s 准入失败保留原终态和零调用结算',
  async (invalid) => {
    const budget = { requests: 2, tokens: 50000, costMicros: 1000000000 };
    const protocol = {
      version: 'arena-historical-match-protocol-v1',
      title: '隔离定价门禁',
      market: 'CN',
      currency: 'CNY',
      timeZone: 'Asia/Shanghai',
      calendarId: 'CN',
      calendarVersion: 'controlled',
      startsOn: '2026-11-12',
      endsOn: '2026-11-12',
      instruments: [
        {
          instrumentId: '11111111-1111-4111-8111-111111111111',
          symbol: '600519.SH',
          assetType: 'STOCK',
        },
      ],
      entrants: [
        {
          providerId: 'controlled',
          model: 'first',
          budget,
          maxInputTokens: 10,
          maxOutputTokens: 2,
        },
        {
          providerId: 'controlled',
          model: 'second',
          budget,
          maxInputTokens: 10,
          maxOutputTokens: 2,
        },
      ],
      initialCash: '1000',
      fees: { version: 'controlled', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
      maxPositionBps: 6000,
      benchmarks: ['cash', 'equal_weight_buy_hold'],
      decisionDeadlineMinutes: 60,
      maxInfrastructureAttempts: 2,
      budgetCurrency: 'USD',
      budget,
    };
    const row = {
      id: 'reservation',
      decisionState: 'ready',
      settledAt: null,
      requestId: null,
      privateBook: { asOf: '2026-11-12T15:00:00Z', cash: '1000', nav: '1000', positions: [] },
      amount: budget,
      entrant: { providerId: 'controlled', model: 'first' },
      round: {
        tradingDate: '2026-11-12',
        arena: { id: 'arena', ownerId: 'owner', protocol },
        packet: { asOf: '2026-11-12T15:00:00Z', facts: [], fingerprint: 'controlled' },
      },
    };
    const db = {
      arenaReservation: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(row),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      arenaOccurrence: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ deadlineAt: new Date(Date.now() + 60000) }),
      },
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
    };
    locks.lock.mockResolvedValue({ state: 'running' });
    const provider = {
      sdkRuntime: () =>
        invalid === 'runtime'
          ? undefined
          : {
              baseURL: 'https://example.invalid',
              apiKey: 'controlled-not-a-key',
            },
      metadata: {
        modelPricing: {
          first: {
            costCurrency: invalid === 'currency' ? 'CNY' : 'USD',
            costPer1kInput: 1,
            costPer1kOutput: invalid === 'price' ? undefined : 2,
          },
        },
      },
    };
    const routes = {
      strictReadyContract: vi.fn().mockReturnValue({
        provider,
        execution: {
          requestOptions: invalid === 'upstream' ? { outputTokenLimit: 'upstream' } : undefined,
        },
      }),
    };
    const sdk = { generate: vi.fn() };
    await new ArenaModelDecisions(db as never, routes as never, sdk as never).execute(
      'reservation',
    );
    expect(sdk.generate).not.toHaveBeenCalled();
    expect(db.arenaReservation.updateMany).not.toHaveBeenCalled();
    expect(db.arenaReservation.update).toHaveBeenCalledWith({
      where: { id: 'reservation' },
      data: {
        decisionState: invalid === 'input' ? 'input_limit' : 'route_unavailable',
        requestAudit: expect.objectContaining({
          providerId: 'controlled',
          requestedModel: 'first',
        }),
      },
    });
    expect(locks.settle).toHaveBeenCalledWith(db, 'reservation', {
      requests: 0,
      tokens: 0,
      costMicros: 0,
    });
  },
);
