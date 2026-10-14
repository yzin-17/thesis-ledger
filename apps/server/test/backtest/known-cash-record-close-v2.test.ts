import { describe, expect, it } from 'vitest';
import {
  SimulationLedger,
  cnTradingCalendar,
  runDeterministicSimulation,
  createCorporateActionPort,
  type BacktestCorporateActionFact,
} from '@thesis-ledger/domain';
import { KnownCashEntitlementV3 } from '../../src/backtest/backtest-known-cash-entitlement-v3.js';
import { BacktestCreationGuardService } from '../../src/backtest/backtest-creation-guard.service.js';
import { knownCashRunFixture } from './known-cash-test-fixtures.js';

const instrument = {
  symbol: '510300.SH',
  market: 'CN',
  assetType: 'etf',
  currency: 'CNY',
} as const;
const fact: BacktestCorporateActionFact = {
  symbol: '510300.SH',
  market: 'CN',
  instrumentType: 'ETF',
  type: 'CASH_DIVIDEND',
  recordDate: '2025-06-17',
  effectiveDate: '2025-06-18',
  paymentDate: '2025-06-27',
  cashAmount: '0.088',
  currency: 'CNY',
  occurredAt: '2025-06-18T01:30:00Z',
  availableAt: '2025-06-18T01:30:00Z',
  provider: 'offline-verified-rule',
  providerRevision: 'v1',
};
// 期望来自登记日交易结束后的权益定义；不是从生产函数输出反推。
const cases = [
  {
    name: 'A登记日新买100未结算',
    initial: '0',
    buy: '2025-06-17',
    sell: undefined,
    sold: '0',
    quantity: '100',
    cash: '8.8',
  },
  {
    name: 'B原100登记日有效卖40',
    initial: '100',
    buy: undefined,
    sell: '2025-06-17',
    sold: '40',
    quantity: '60',
    cash: '5.28',
  },
  {
    name: 'C除息日新买',
    initial: '0',
    buy: '2025-06-18',
    sell: undefined,
    sold: '0',
    quantity: '0',
    cash: '0',
  },
  {
    name: 'D截止100除息日卖出',
    initial: '100',
    buy: undefined,
    sell: '2025-06-18',
    sold: '100',
    quantity: '100',
    cash: '8.8',
  },
  {
    name: 'E派息日新买',
    initial: '0',
    buy: '2025-06-27',
    sell: undefined,
    sold: '0',
    quantity: '0',
    cash: '0',
  },
  {
    name: 'F发放晚于窗口保留应收',
    initial: '100',
    buy: undefined,
    sell: undefined,
    sold: '0',
    quantity: '100',
    cash: '8.8',
  },
] as const;

describe('场内ETF登记截止权益与可卖/资金状态分离', () => {
  it('旧准备包不能直接创建新研究，必须重新准备；旧内容未修改', async () => {
    const legacy = await knownCashRunFixture();
    const guard = new BacktestCreationGuardService({} as never, {} as never);
    const before = JSON.stringify(legacy.runConfig);
    await expect(
      guard.check(
        {
          contractVersion: 3,
          strategyVersionId: 'old',
          runConfig: legacy.runConfig,
          idempotencyKey: 'old',
          preparationStamp: {} as never,
        },
        legacy.strategy,
      ),
    ).rejects.toThrow('旧分红资格版本须重新准备');
    expect(JSON.stringify(legacy.runConfig)).toBe(before);
  });
  it.each(cases)('$name：资格$quantity，应收$cash；无策略决策也独立采集', (scenario) => {
    const ledger = new SimulationLedger({
      executionInstrument: instrument,
      baseCurrency: 'CNY',
      initialCash: { CNY: '1000' },
      accountingBasis: 'raw-events',
    });
    const fill = (id: string, side: 'buy' | 'sell', quantity: string, day: string) => {
      expect(
        ledger.applyFill({
          eventId: id,
          fillId: id,
          executionSymbol: instrument.symbol,
          side,
          quantity,
          price: '4',
          currency: 'CNY',
          charges: [],
          occurredAt: day + 'T01:30:00Z',
          availableAt: day + 'T01:30:00Z',
        }).applied,
      ).toBe(true);
      ledger.applySettlement({
        eventId: id + '-cash',
        sourceEventId: id,
        kind: 'cash',
        occurredAt: day + 'T01:30:00Z',
        availableAt: day + 'T01:30:00Z',
      });
    };
    if (scenario.initial !== '0') {
      fill('initial', 'buy', scenario.initial, '2025-06-16');
      ledger.applySettlement({
        eventId: 'initial-settlement',
        sourceEventId: 'initial',
        occurredAt: '2025-06-16T07:00:00Z',
        availableAt: '2025-06-16T07:00:00Z',
      });
    }
    const events = [scenario.buy, scenario.sell].filter((day) => day !== undefined);
    const entitlement = new KnownCashEntitlementV3(
      cnTradingCalendar,
      '2025-06-16',
      'cn-etf-record-close-holdings-v2',
    );
    let observed: ReturnType<SimulationLedger['snapshot']> | undefined;
    runDeterministicSimulation({
      runId: scenario.name,
      strategy: {
        executionInstrument: instrument,
        primaryTimeframe: '1d',
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'constant', value: '0' },
          right: { type: 'constant', value: '1' },
        },
        exit: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'constant', value: '0' },
          right: { type: 'constant', value: '1' },
        },
      },
      ticks: [],
      sourceSeries: {},
      corporateActions: [fact],
      ...entitlement.checkpoint([fact], () => {
        observed = ledger.snapshot();
        return observed.position.quantity;
      }),
      portfolioValuation: {
        ticks: events.map((day) => ({ occurredAt: day + 'T01:30:00Z' })),
        valueAt: (tick) => {
          const day = tick.occurredAt.slice(0, 10);
          if (day === scenario.buy) fill('buy', 'buy', '100', day);
          if (day === scenario.sell) fill('sell', 'sell', scenario.sold, day);
        },
      },
      corporateActionPort: createCorporateActionPort(ledger, instrument, scenario.name, (row) =>
        entitlement.quantityFor(row),
      ),
    });
    expect(entitlement.quantityFor(fact)).toBe(scenario.quantity);
    expect(ledger.snapshot().cash.CNY.unsettled).toBe(scenario.cash);
    if (scenario.name.startsWith('A'))
      expect(observed?.position).toMatchObject({
        quantity: '100',
        settledQuantity: '0',
        unsettledQuantity: '100',
      });
    if (scenario.name.startsWith('F')) expect(ledger.availableCash('CNY')).toBe('600');
  });

  it('未成交委托/较早策略评估不会覆盖收盘采集；legacy仍保留原数量', () => {
    const current = new KnownCashEntitlementV3(
      cnTradingCalendar,
      '2025-06-16',
      'cn-etf-record-close-holdings-v2',
    );
    current.captureLegacy('2025-06-17T01:30:00Z', '0');
    expect(() => current.quantityFor(fact)).toThrow('未冻结');
    const checkpoint = current.checkpoint([fact], () => '100').positionCheckpoint!;
    expect(checkpoint.ticks[0]!.occurredAt).toBe('2025-06-17T07:00:00.000Z');
    checkpoint.captureAt(checkpoint.ticks[0]!);
    current.captureLegacy('2025-06-17T09:00:00Z', '0');
    expect(current.quantityFor(fact)).toBe('100');
    const legacy = new KnownCashEntitlementV3(cnTradingCalendar, '2025-06-16');
    legacy.captureLegacy('2025-06-17T07:00:00Z', '0');
    expect(legacy.quantityFor(fact)).toBe('0');
    expect(legacy.checkpoint([fact], () => '100')).toEqual({});
  });
});
