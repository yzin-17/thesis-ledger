import { DecimalValue } from './decimal.js';
import type {
  BacktestAssetType,
  BacktestCurrency,
  BacktestMoney,
  V2BacktestMarket,
} from './backtest-v2.js';

export const backtestCurrencies = ['CNY', 'HKD', 'USD'] as const;

export type SimulationLedgerRejectCode =
  | 'DUPLICATE_EVENT'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_SETTLED_POSITION'
  | 'INSTRUMENT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_AMOUNT'
  | 'INVALID_TIME'
  | 'SETTLEMENT_SOURCE_NOT_FOUND'
  | 'FUTURE_DATA';

export interface SimulationExecutionInstrument {
  symbol: string;
  market: V2BacktestMarket;
  assetType: BacktestAssetType;
  currency: BacktestCurrency;
}

export interface SimulationCashBalance {
  currency: BacktestCurrency;
  settled: string;
  unsettled: string;
}

export interface SimulationPosition {
  symbol: string;
  market: V2BacktestMarket;
  assetType: BacktestAssetType;
  currency: BacktestCurrency;
  quantity: string;
  settledQuantity: string;
  unsettledQuantity: string;
  averageCost: string;
}

export interface SimulationLedgerState {
  baseCurrency: BacktestCurrency;
  cash: Readonly<Record<BacktestCurrency, SimulationCashBalance>>;
  position: SimulationPosition;
}

export interface SimulationLedgerConfig {
  executionInstrument: SimulationExecutionInstrument;
  baseCurrency: BacktestCurrency;
  initialCash: Partial<Record<BacktestCurrency, string>>;
}

export type SimulationLedgerCharge = BacktestMoney;

export interface SimulationLedgerFill {
  eventId: string;
  fillId: string;
  executionSymbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  charges: readonly SimulationLedgerCharge[];
  currency: BacktestCurrency;
  occurredAt: string;
  availableAt: string;
}

export interface SimulationSettlement {
  eventId: string;
  sourceEventId: string;
  kind?: 'cash' | 'position' | 'both';
  currency?: BacktestCurrency;
  symbol?: string;
  occurredAt: string;
  availableAt: string;
}

export interface SimulationCashDividend {
  eventId: string;
  executionSymbol: string;
  amountPerShare: string;
  currency: BacktestCurrency;
  occurredAt: string;
  availableAt: string;
}

export interface SimulationSplit {
  eventId: string;
  executionSymbol: string;
  ratio: string;
  occurredAt: string;
  availableAt: string;
}

export type SimulationLedgerEvent =
  | { type: 'fill'; payload: SimulationLedgerFill }
  | { type: 'settlement'; payload: SimulationSettlement }
  | { type: 'cashDividend'; payload: SimulationCashDividend }
  | { type: 'split'; payload: SimulationSplit };

export interface AppliedLedgerMutation {
  applied: true;
  eventId: string;
  state: SimulationLedgerState;
  realizedPnl?: string;
}

export interface RejectedLedgerMutation {
  applied: false;
  eventId: string;
  code: SimulationLedgerRejectCode;
  reason: string;
  state: SimulationLedgerState;
}

export type LedgerMutationResult = AppliedLedgerMutation | RejectedLedgerMutation;

export class SimulationLedgerError extends Error {
  constructor(
    readonly code: Exclude<SimulationLedgerRejectCode, 'DUPLICATE_EVENT' | 'FUTURE_DATA'>,
    message: string,
  ) {
    super(message);
    this.name = 'SimulationLedgerError';
  }
}

const cloneCash = (cash: SimulationCashBalance): SimulationCashBalance => ({ ...cash });

const parseAmount = (value: string, label: string) => {
  try {
    return DecimalValue.from(value);
  } catch {
    throw new SimulationLedgerError('INVALID_AMOUNT', `${label} 不是规范十进制值`);
  }
};

const zeroCash = (currency: BacktestCurrency): SimulationCashBalance => ({
  currency,
  settled: '0',
  unsettled: '0',
});

const addTo = (value: string, delta: DecimalValue) =>
  DecimalValue.from(value).plus(delta).toString();

const totalPosition = (
  position: Pick<SimulationPosition, 'settledQuantity' | 'unsettledQuantity'>,
) => DecimalValue.from(position.settledQuantity).plus(position.unsettledQuantity).toString();

const instrumentMatches = (instrument: SimulationExecutionInstrument, symbol: string) =>
  instrument.symbol === symbol;

const amountOfCharges = (
  charges: readonly SimulationLedgerCharge[],
  currency: BacktestCurrency,
) => {
  let total = DecimalValue.from('0');
  for (const charge of charges) {
    if (charge.currency !== currency) {
      throw new SimulationLedgerError('CURRENCY_MISMATCH', '费用币种必须与执行标的币种一致');
    }
    const amount = parseAmount(charge.amount, '费用');
    if (amount.isNegative()) {
      throw new SimulationLedgerError('INVALID_AMOUNT', '费用不能为负数');
    }
    total = total.plus(amount);
  }
  return total;
};

export class SimulationLedger {
  private readonly cashBalances: Record<BacktestCurrency, SimulationCashBalance>;

  private readonly pendingDebits: Record<BacktestCurrency, DecimalValue>;

  private readonly pendingCredits: Record<BacktestCurrency, DecimalValue>;

  private readonly pendingCashEffects = new Map<
    string,
    { currency: BacktestCurrency; debit: DecimalValue; credit: DecimalValue }
  >();

  private readonly pendingPositionEffects = new Map<string, DecimalValue>();

  private readonly appliedEvents = new Set<string>();

  private readonly appliedFills = new Set<string>();

  private positionCostBasis: DecimalValue;

  private readonly position: SimulationPosition;

  constructor(private readonly config: SimulationLedgerConfig) {
    this.cashBalances = {
      CNY: zeroCash('CNY'),
      HKD: zeroCash('HKD'),
      USD: zeroCash('USD'),
    };
    this.pendingDebits = {
      CNY: DecimalValue.from('0'),
      HKD: DecimalValue.from('0'),
      USD: DecimalValue.from('0'),
    };
    this.pendingCredits = {
      CNY: DecimalValue.from('0'),
      HKD: DecimalValue.from('0'),
      USD: DecimalValue.from('0'),
    };
    for (const currency of backtestCurrencies) {
      const initial = config.initialCash[currency] ?? '0';
      const value = parseAmount(initial, `初始 ${currency} 现金`);
      if (value.isNegative())
        throw new SimulationLedgerError('INVALID_AMOUNT', '初始现金不能为负数');
      this.cashBalances[currency].settled = value.toString();
    }
    this.positionCostBasis = DecimalValue.from('0');
    this.position = {
      symbol: config.executionInstrument.symbol,
      market: config.executionInstrument.market,
      assetType: config.executionInstrument.assetType,
      currency: config.executionInstrument.currency,
      quantity: '0',
      settledQuantity: '0',
      unsettledQuantity: '0',
      averageCost: '0',
    };
  }

  snapshot(): SimulationLedgerState {
    return {
      baseCurrency: this.config.baseCurrency,
      cash: {
        CNY: cloneCash(this.cashBalances.CNY),
        HKD: cloneCash(this.cashBalances.HKD),
        USD: cloneCash(this.cashBalances.USD),
      },
      position: { ...this.position },
    };
  }

  availableCash(currency: BacktestCurrency) {
    const balance = this.cashBalances[currency];
    const pendingDebit = this.pendingDebits[currency];
    return DecimalValue.from(balance.settled).minus(pendingDebit).toString();
  }

  applyEvent(event: SimulationLedgerEvent, evaluationAt?: string): LedgerMutationResult {
    const payload = event.payload;
    if (this.appliedEvents.has(payload.eventId)) {
      return {
        applied: false,
        eventId: payload.eventId,
        code: 'DUPLICATE_EVENT',
        reason: 'Simulation Event 已经应用',
        state: this.snapshot(),
      };
    }
    const at = evaluationAt ?? payload.occurredAt;
    let result: LedgerMutationResult;
    if (event.type === 'fill') result = this.applyFill(event.payload, at);
    else if (event.type === 'settlement') result = this.applySettlement(event.payload, at);
    else if (event.type === 'cashDividend') result = this.applyCashDividend(event.payload, at);
    else result = this.applySplit(event.payload, at);
    if (result.applied) this.appliedEvents.add(payload.eventId);
    return result;
  }

  applyFill(fill: SimulationLedgerFill, evaluationAt = fill.occurredAt): LedgerMutationResult {
    if (this.appliedEvents.has(fill.eventId) || this.appliedFills.has(fill.fillId)) {
      return this.rejection(fill.eventId, 'DUPLICATE_EVENT', 'Simulation Fill 已经应用');
    }
    try {
      const availability = this.assertAvailable(
        fill.eventId,
        fill.occurredAt,
        fill.availableAt,
        evaluationAt,
      );
      if (availability) return availability;
      this.assertFillIdentity(fill);
      const quantity = parseAmount(fill.quantity, '成交数量');
      const price = parseAmount(fill.price, '成交价格');
      if (!quantity.isPositive() || !price.isPositive()) {
        return this.rejection(fill.eventId, 'INVALID_AMOUNT', '成交数量和价格必须为正数');
      }
      const charges = amountOfCharges(fill.charges, fill.currency);
      if (fill.side === 'buy') return this.applyBuy(fill, quantity, price, charges);
      return this.applySell(fill, quantity, price, charges);
    } catch (error) {
      if (error instanceof SimulationLedgerError) {
        return this.rejection(fill.eventId, error.code, error.message);
      }
      throw error;
    }
  }

  applySettlement(
    settlement: SimulationSettlement,
    evaluationAt = settlement.occurredAt,
  ): LedgerMutationResult {
    if (this.appliedEvents.has(settlement.eventId)) {
      return this.rejection(settlement.eventId, 'DUPLICATE_EVENT', 'Simulation Event 已经应用');
    }
    const availability = this.assertAvailable(
      settlement.eventId,
      settlement.occurredAt,
      settlement.availableAt,
      evaluationAt,
    );
    if (availability) return availability;
    if (settlement.symbol !== undefined && settlement.symbol !== this.position.symbol) {
      return this.rejection(settlement.eventId, 'INSTRUMENT_MISMATCH', '结算标的不是执行标的');
    }
    const cashEffect = this.pendingCashEffects.get(settlement.sourceEventId);
    const positionEffect = this.pendingPositionEffects.get(settlement.sourceEventId);
    if (!cashEffect && !positionEffect) {
      return this.rejection(
        settlement.eventId,
        'SETTLEMENT_SOURCE_NOT_FOUND',
        '结算没有对应的待结算成交或公司行动',
      );
    }
    const kind = settlement.kind ?? 'both';
    if ((kind === 'cash' || kind === 'both') && cashEffect) {
      if (settlement.currency !== undefined && settlement.currency !== cashEffect.currency) {
        return this.rejection(settlement.eventId, 'CURRENCY_MISMATCH', '结算币种与来源事件不一致');
      }
      this.settleCashEffect(settlement.sourceEventId, cashEffect);
    }
    if ((kind === 'position' || kind === 'both') && positionEffect) {
      this.position.settledQuantity = addTo(this.position.settledQuantity, positionEffect);
      this.position.unsettledQuantity = DecimalValue.from(this.position.unsettledQuantity)
        .minus(positionEffect)
        .toString();
      this.pendingPositionEffects.delete(settlement.sourceEventId);
      this.position.quantity = totalPosition(this.position);
    }
    return this.applied(settlement.eventId);
  }

  applyCashDividend(
    dividend: SimulationCashDividend,
    evaluationAt = dividend.occurredAt,
  ): LedgerMutationResult {
    if (this.appliedEvents.has(dividend.eventId)) {
      return this.rejection(dividend.eventId, 'DUPLICATE_EVENT', 'Simulation Event 已经应用');
    }
    try {
      const availability = this.assertAvailable(
        dividend.eventId,
        dividend.occurredAt,
        dividend.availableAt,
        evaluationAt,
      );
      if (availability) return availability;
      this.assertFillIdentity(dividend);
      const amountPerShare = parseAmount(dividend.amountPerShare, '每股分红');
      if (amountPerShare.isNegative()) {
        return this.rejection(dividend.eventId, 'INVALID_AMOUNT', '每股分红不能为负数');
      }
      if (dividend.currency !== this.position.currency) {
        return this.rejection(
          dividend.eventId,
          'CURRENCY_MISMATCH',
          '分红币种必须与执行标的币种一致',
        );
      }
      const amount = amountPerShare.times(this.position.settledQuantity);
      this.pendingCredits[dividend.currency] = this.pendingCredits[dividend.currency].plus(amount);
      this.pendingCashEffects.set(dividend.eventId, {
        currency: dividend.currency,
        debit: DecimalValue.from('0'),
        credit: amount,
      });
      this.refreshUnsettled(dividend.currency);
      return this.applied(dividend.eventId);
    } catch (error) {
      if (error instanceof SimulationLedgerError) {
        return this.rejection(dividend.eventId, error.code, error.message);
      }
      throw error;
    }
  }

  applySplit(split: SimulationSplit, evaluationAt = split.occurredAt): LedgerMutationResult {
    if (this.appliedEvents.has(split.eventId)) {
      return this.rejection(split.eventId, 'DUPLICATE_EVENT', 'Simulation Event 已经应用');
    }
    try {
      const availability = this.assertAvailable(
        split.eventId,
        split.occurredAt,
        split.availableAt,
        evaluationAt,
      );
      if (availability) return availability;
      this.assertFillIdentity(split);
      const ratio = parseAmount(split.ratio, '拆分比例');
      if (!ratio.isPositive()) {
        return this.rejection(split.eventId, 'INVALID_AMOUNT', '拆分比例必须为正数');
      }
      this.position.settledQuantity = DecimalValue.from(this.position.settledQuantity)
        .times(ratio)
        .toString();
      this.position.unsettledQuantity = DecimalValue.from(this.position.unsettledQuantity)
        .times(ratio)
        .toString();
      for (const [eventId, quantity] of this.pendingPositionEffects) {
        this.pendingPositionEffects.set(eventId, quantity.times(ratio));
      }
      this.position.quantity = totalPosition(this.position);
      this.refreshAverageCost();
      return this.applied(split.eventId);
    } catch (error) {
      if (error instanceof SimulationLedgerError) {
        return this.rejection(split.eventId, error.code, error.message);
      }
      throw error;
    }
  }

  private applyBuy(
    fill: SimulationLedgerFill,
    quantity: DecimalValue,
    price: DecimalValue,
    charges: DecimalValue,
  ): LedgerMutationResult {
    const gross = quantity.times(price);
    const debit = gross.plus(charges);
    if (DecimalValue.from(this.availableCash(fill.currency)).compareTo(debit) < 0) {
      return this.rejection(fill.eventId, 'INSUFFICIENT_CASH', '执行币种已结算现金不足');
    }
    this.pendingDebits[fill.currency] = this.pendingDebits[fill.currency].plus(debit);
    this.pendingCashEffects.set(fill.eventId, {
      currency: fill.currency,
      debit,
      credit: DecimalValue.from('0'),
    });
    this.pendingPositionEffects.set(fill.eventId, quantity);
    this.refreshUnsettled(fill.currency);
    this.positionCostBasis = this.positionCostBasis.plus(debit);
    this.position.unsettledQuantity = addTo(this.position.unsettledQuantity, quantity);
    this.position.quantity = totalPosition(this.position);
    this.refreshAverageCost();
    this.appliedFills.add(fill.fillId);
    return this.applied(fill.eventId);
  }

  private applySell(
    fill: SimulationLedgerFill,
    quantity: DecimalValue,
    price: DecimalValue,
    charges: DecimalValue,
  ): LedgerMutationResult {
    const settled = DecimalValue.from(this.position.settledQuantity);
    if (settled.compareTo(quantity) < 0) {
      return this.rejection(fill.eventId, 'INSUFFICIENT_SETTLED_POSITION', '已结算可卖持仓不足');
    }
    const gross = quantity.times(price);
    const credit = gross.minus(charges);
    if (credit.isNegative()) {
      return this.rejection(fill.eventId, 'INVALID_AMOUNT', '成交费用不能高于成交金额');
    }
    this.pendingCredits[fill.currency] = this.pendingCredits[fill.currency].plus(credit);
    this.pendingCashEffects.set(fill.eventId, {
      currency: fill.currency,
      debit: DecimalValue.from('0'),
      credit,
    });
    this.refreshUnsettled(fill.currency);
    const averageCost = DecimalValue.from(this.position.averageCost);
    const realizedPnl = gross.minus(averageCost.times(quantity)).minus(charges);
    this.positionCostBasis = this.positionCostBasis.minus(averageCost.times(quantity));
    this.position.settledQuantity = settled.minus(quantity).toString();
    this.position.quantity = totalPosition(this.position);
    this.refreshAverageCost();
    this.appliedFills.add(fill.fillId);
    return this.applied(fill.eventId, realizedPnl.toString());
  }

  private assertFillIdentity(input: { executionSymbol: string; currency?: BacktestCurrency }) {
    if (!instrumentMatches(this.config.executionInstrument, input.executionSymbol)) {
      throw new SimulationLedgerError('INSTRUMENT_MISMATCH', '事件标的不是唯一执行标的');
    }
    if (input.currency !== undefined && input.currency !== this.position.currency) {
      throw new SimulationLedgerError('CURRENCY_MISMATCH', '事件币种必须与执行标的币种一致');
    }
  }

  private settleCashEffect(
    sourceEventId: string,
    effect: { currency: BacktestCurrency; debit: DecimalValue; credit: DecimalValue },
  ) {
    const { currency } = effect;
    const { debit, credit } = effect;
    const net = credit.minus(debit);
    this.cashBalances[currency].settled = addTo(this.cashBalances[currency].settled, net);
    this.pendingDebits[currency] = this.pendingDebits[currency].minus(debit);
    this.pendingCredits[currency] = this.pendingCredits[currency].minus(credit);
    this.pendingCashEffects.delete(sourceEventId);
    this.refreshUnsettled(currency);
  }

  private assertAvailable(
    eventId: string,
    occurredAt: string,
    availableAt: string,
    evaluationAt: string,
  ): RejectedLedgerMutation | undefined {
    const occurred = Date.parse(occurredAt);
    const available = Date.parse(availableAt);
    const evaluation = Date.parse(evaluationAt);
    if (![occurred, available, evaluation].every(Number.isFinite)) {
      return this.rejection(eventId, 'INVALID_TIME', 'Simulation Event 时间无效');
    }
    if (available < occurred) {
      return this.rejection(eventId, 'INVALID_TIME', 'availableAt 不能早于 occurredAt');
    }
    if (occurred > evaluation) {
      return this.rejection(eventId, 'FUTURE_DATA', 'Simulation Event 尚未发生');
    }
    if (available > evaluation) {
      return this.rejection(eventId, 'FUTURE_DATA', 'Simulation Event 在评估时尚不可用');
    }
    return undefined;
  }

  private refreshUnsettled(currency: BacktestCurrency) {
    this.cashBalances[currency].unsettled = this.pendingCredits[currency]
      .minus(this.pendingDebits[currency])
      .toString();
  }

  private refreshAverageCost() {
    const quantity = DecimalValue.from(this.position.quantity);
    this.position.averageCost = quantity.isZero()
      ? '0'
      : this.positionCostBasis.dividedBy(quantity).toString();
  }

  private applied(eventId: string, realizedPnl?: string): AppliedLedgerMutation {
    this.appliedEvents.add(eventId);
    return {
      applied: true,
      eventId,
      state: this.snapshot(),
      ...(realizedPnl === undefined ? {} : { realizedPnl }),
    };
  }

  private rejection(
    eventId: string,
    code: SimulationLedgerRejectCode,
    reason: string,
  ): RejectedLedgerMutation {
    return { applied: false, eventId, code, reason, state: this.snapshot() };
  }
}

export const replaySimulationLedger = (
  config: SimulationLedgerConfig,
  events: readonly SimulationLedgerEvent[],
) => {
  const ledger = new SimulationLedger(config);
  const results = events.map((event) => ledger.applyEvent(event));
  return { ledger, results, state: ledger.snapshot() };
};
