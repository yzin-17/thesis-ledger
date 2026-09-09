import { DecimalValue } from './decimal.js';
import type {
  BacktestCurrency,
  BacktestMoney,
  BacktestTradeV2,
  BacktestMetric,
  SimulationFill,
} from './backtest-v2.js';

export interface BacktestTradeProjectionOptions {
  executionSymbol: string;
  currency: BacktestCurrency;
}

export interface OpenBacktestPosition {
  executionSymbol: string;
  quantity: string;
  fillIds: string[];
}

export interface BacktestTradeProjection {
  source: 'BACKTEST';
  trades: BacktestTradeV2[];
  openPositions: OpenBacktestPosition[];
  status: 'complete' | 'partial' | 'unavailable';
  warnings: string[];
}

export interface BacktestTradeMetrics {
  tradeCount: BacktestMetric;
  winRate: BacktestMetric;
  profitFactor: BacktestMetric;
  warnings: string[];
}

interface OpenLifecycle {
  executionSymbol: string;
  currency: BacktestCurrency;
  openedAt: string;
  remainingQuantity: DecimalValue;
  entryQuantity: DecimalValue;
  exitQuantity: DecimalValue;
  entryValue: DecimalValue;
  exitValue: DecimalValue;
  charges: BacktestMoney[];
  fillIds: string[];
  closeReason?: 'signal' | 'risk';
}

const time = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`无效成交时间: ${value}`);
  return parsed;
};

const decimal = (value: string, label: string) => {
  try {
    return DecimalValue.from(value);
  } catch {
    throw new Error(`${label} 不是规范十进制值`);
  }
};

const compareFills = (left: SimulationFill, right: SimulationFill) => {
  const occurred = time(left.occurredAt) - time(right.occurredAt);
  return occurred !== 0 ? occurred : left.fillId.localeCompare(right.fillId);
};

const addCharges = (
  lifecycle: OpenLifecycle,
  charges: readonly BacktestMoney[],
  expectedCurrency: BacktestCurrency,
) => {
  for (const charge of charges) {
    if (charge.currency !== expectedCurrency) {
      throw new Error(`费用币种 ${charge.currency} 与执行币种 ${expectedCurrency} 不一致`);
    }
    lifecycle.charges.push({
      amount: decimal(charge.amount, '费用').toString(),
      currency: charge.currency,
    });
  }
};

const sumCharges = (charges: readonly BacktestMoney[]) =>
  charges.reduce((total, charge) => total.plus(charge.amount), DecimalValue.from('0'));

const closeTrade = (lifecycle: OpenLifecycle, closedAt: string): BacktestTradeV2 => {
  const charges = sumCharges(lifecycle.charges);
  const realizedPnl = lifecycle.exitValue.minus(lifecycle.entryValue).minus(charges);
  const returnRate = realizedPnl.dividedBy(lifecycle.entryValue, 20);
  return {
    source: 'BACKTEST',
    executionSymbol: lifecycle.executionSymbol,
    openedAt: lifecycle.openedAt,
    closedAt,
    entryQuantity: lifecycle.entryQuantity.toString(),
    exitQuantity: lifecycle.exitQuantity.toString(),
    entryValue: { amount: lifecycle.entryValue.toString(), currency: lifecycle.currency },
    exitValue: { amount: lifecycle.exitValue.toString(), currency: lifecycle.currency },
    realizedPnl: { amount: realizedPnl.toString(), currency: lifecycle.currency },
    charges: lifecycle.charges,
    returnRate: returnRate.toString(),
    closeReason: lifecycle.closeReason ?? 'signal',
    fillIds: [...lifecycle.fillIds],
  };
};

const openPosition = (lifecycle: OpenLifecycle): OpenBacktestPosition => ({
  executionSymbol: lifecycle.executionSymbol,
  quantity: lifecycle.remainingQuantity.toString(),
  fillIds: [...lifecycle.fillIds],
});

/**
 * Projects only closed long lifecycles. It never fabricates an end fill, so a
 * position still open at endDate remains in openPositions and is excluded
 * from trade metrics.
 */
export const projectBacktestTrades = (
  fills: readonly SimulationFill[],
  options: BacktestTradeProjectionOptions,
): BacktestTradeProjection => {
  const warnings: string[] = [];
  const trades: BacktestTradeV2[] = [];
  let lifecycle: OpenLifecycle | undefined;
  const seenFillIds = new Set<string>();
  let validFills = 0;
  const sorted = [...fills].sort((left, right) => {
    try {
      return compareFills(left, right);
    } catch {
      return left.fillId.localeCompare(right.fillId);
    }
  });

  for (const fill of sorted) {
    if (seenFillIds.has(fill.fillId)) {
      warnings.push(`DUPLICATE_FILL:${fill.fillId}`);
      continue;
    }
    seenFillIds.add(fill.fillId);
    try {
      time(fill.occurredAt);
      if (fill.executionSymbol !== options.executionSymbol) {
        throw new Error(`成交标的 ${fill.executionSymbol} 不是唯一执行标的`);
      }
      const quantity = decimal(fill.quantity, '成交数量');
      const price = decimal(fill.price, '成交价格');
      if (!quantity.isPositive() || !price.isPositive()) {
        throw new Error('成交数量和价格必须为正数');
      }
      const value = quantity.times(price);
      if (fill.side === 'buy') {
        if (!lifecycle) {
          lifecycle = {
            executionSymbol: fill.executionSymbol,
            currency: options.currency,
            openedAt: fill.occurredAt,
            remainingQuantity: DecimalValue.from('0'),
            entryQuantity: DecimalValue.from('0'),
            exitQuantity: DecimalValue.from('0'),
            entryValue: DecimalValue.from('0'),
            exitValue: DecimalValue.from('0'),
            charges: [],
            fillIds: [],
          };
        }
        addCharges(lifecycle, fill.charges, options.currency);
        lifecycle.remainingQuantity = lifecycle.remainingQuantity.plus(quantity);
        lifecycle.entryQuantity = lifecycle.entryQuantity.plus(quantity);
        lifecycle.entryValue = lifecycle.entryValue.plus(value);
      } else {
        if (!lifecycle) throw new Error('SELL_WITHOUT_OPEN_POSITION');
        if (quantity.compareTo(lifecycle.remainingQuantity) > 0) {
          throw new Error('SELL_EXCEEDS_OPEN_QUANTITY');
        }
        addCharges(lifecycle, fill.charges, options.currency);
        lifecycle.remainingQuantity = lifecycle.remainingQuantity.minus(quantity);
        lifecycle.exitQuantity = lifecycle.exitQuantity.plus(quantity);
        lifecycle.exitValue = lifecycle.exitValue.plus(value);
        lifecycle.closeReason = fill.reason;
      }
      lifecycle.fillIds.push(fill.fillId);
      validFills += 1;
      if (lifecycle.remainingQuantity.isZero()) {
        trades.push(closeTrade(lifecycle, fill.occurredAt));
        lifecycle = undefined;
      }
    } catch (error) {
      warnings.push(
        `${fill.fillId}:${error instanceof Error ? error.message : '成交不可用于 Trade 投影'}`,
      );
    }
  }

  const openPositions = lifecycle ? [openPosition(lifecycle)] : [];
  let status: BacktestTradeProjection['status'] = 'complete';
  if (fills.length > 0 && warnings.length > 0) {
    status = validFills === 0 ? 'unavailable' : 'partial';
  }
  return { source: 'BACKTEST', trades, openPositions, status, warnings };
};

const available = (value: string): BacktestMetric => ({ status: 'available', value });
const unavailable = (reason: string): BacktestMetric => ({ status: 'unavailable', reason });

/** Metrics deliberately consume projected closed trades only. */
export const calculateBacktestTradeMetrics = (
  trades: readonly BacktestTradeV2[],
): BacktestTradeMetrics => {
  const wins = trades.filter((trade) => DecimalValue.from(trade.realizedPnl.amount).isPositive());
  const losses = trades.filter((trade) => DecimalValue.from(trade.realizedPnl.amount).isNegative());
  const grossProfit = wins.reduce(
    (total, trade) => total.plus(trade.realizedPnl.amount),
    DecimalValue.from('0'),
  );
  const grossLoss = losses.reduce(
    (total, trade) => total.plus(DecimalValue.from('0').minus(trade.realizedPnl.amount)),
    DecimalValue.from('0'),
  );
  const tradeCount = available(String(trades.length));
  const winRate =
    trades.length === 0
      ? unavailable('NO_CLOSED_TRADES')
      : available(
          DecimalValue.from(String(wins.length)).dividedBy(String(trades.length), 20).toString(),
        );
  const profitFactor = grossLoss.isZero()
    ? unavailable(trades.length === 0 ? 'NO_CLOSED_TRADES' : 'NO_LOSING_TRADES')
    : available(grossProfit.dividedBy(grossLoss, 20).toString());
  return { tradeCount, winRate, profitFactor, warnings: [] };
};

export const projectSimulationFillsToTrades = projectBacktestTrades;
export const backtestTradeMetrics = calculateBacktestTradeMetrics;
