/**
 * Runtime-facing simulation vocabulary. Validation and JSON boundaries live
 * in @thesis-ledger/schemas; these structural types keep the simulation domain
 * independent from Zod.
 */

import type { BacktestTradePlan } from './backtest-trade-plan-contract.js';
export type BacktestTimeframe = '1d' | '60m' | '30m' | '15m' | '5m' | '1m';
export type BacktestMarket = 'CN' | 'HK' | 'US';
export type BacktestAssetType = 'stock' | 'etf' | 'fund';
export type BacktestCurrency = 'CNY' | 'HKD' | 'USD';
export type BacktestSeriesField = 'open' | 'high' | 'low' | 'close' | 'volume' | 'nav';

export interface BacktestAssetSymbolRef {
  symbol: string;
  market: BacktestMarket;
  assetType: BacktestAssetType;
}

export interface BacktestSignalSource {
  id: string;
  priceCoordinate?: 'research' | 'actual' | 'run' | 'native-nav';
  asset: BacktestAssetSymbolRef;
  timeframe: BacktestTimeframe;
  series: BacktestSeriesField[];
}

export interface BacktestSeriesRef {
  sourceId: string;
  field: BacktestSeriesField;
}

export type BacktestDecimalString = string;
export interface BacktestMoney {
  amount: BacktestDecimalString;
  currency: BacktestCurrency;
}

export type BacktestCorporateActionEventType = 'CASH_DIVIDEND' | 'SPLIT' | 'REVERSE_SPLIT';

export type NumericExpression =
  | {
      type: 'confirmedPivot';
      side: 'low' | 'high';
      leftBars: number;
      rightBars: number;
      offset: 0 | 1;
      input: NumericExpression;
      sample?: NumericExpression | undefined;
    }
  | { type: 'eventValue' }
  | {
      type: 'rolling';
      statistic: 'sum' | 'standardDeviation' | 'quantile';
      periods: number;
      input: NumericExpression;
      ddof?: 0 | 1 | undefined;
      quantile?: string | undefined;
    }
  | { type: 'cumulative'; statistic: 'sum' | 'max'; anchorAt: string; input: NumericExpression }
  | { type: 'countTrue'; periods: number; condition: BooleanExpression }
  | {
      type: 'arithmetic';
      operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max';
      left: NumericExpression;
      right: NumericExpression;
    }
  | { type: 'absolute'; input: NumericExpression }
  | { type: 'lag'; periods: number; input: NumericExpression }
  | { type: 'sessionValue'; sourceId: string; field: 'vwap' | 'elapsedMinutes' }
  | { type: 'constant'; value: BacktestDecimalString }
  | { type: 'series'; sourceId: string; field: BacktestSeriesField }
  | {
      type: 'indicator';
      name: 'MA' | 'EMA' | 'RSI' | 'MACD' | 'ATR' | 'VWAP' | 'Highest' | 'Lowest' | 'ADX';
      input: NumericExpression;
      params: Record<string, number | BacktestDecimalString>;
      output?: 'macd' | 'signal' | 'histogram' | 'adx' | 'plusDI' | 'minusDI';
    }
  | { type: 'positionState'; field: 'quantity' | 'averageCost' | 'holdingPeriods' };

export type BooleanExpression =
  | {
      type: 'sequence';
      trigger: BooleanExpression;
      confirm: BooleanExpression;
      invalidation: BooleanExpression;
      within: number;
      allowSameBar: boolean;
      repeat: boolean;
      capture?: NumericExpression | undefined;
    }
  | { type: 'consecutive'; periods: number; condition: BooleanExpression }
  | { type: 'all'; conditions: BooleanExpression[] }
  | { type: 'any'; conditions: BooleanExpression[] }
  | { type: 'not'; expression: BooleanExpression }
  | {
      type: 'compare';
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
      left: NumericExpression;
      right: NumericExpression;
    }
  | {
      type: 'cross';
      direction: 'above' | 'below';
      left: NumericExpression;
      right: NumericExpression;
    }
  | { type: 'corporateActionEvent'; eventType: BacktestCorporateActionEventType }
  | { type: 'positionState'; field: 'isOpen' };

export type Expression = NumericExpression | BooleanExpression;

export interface BacktestStrategy {
  entryTrigger?: 'rising-edge' | 'while-flat' | undefined;
  tradePlan?: BacktestTradePlan | undefined;
  schemaVersion: 'strategy-definition-v1';
  name: string;
  description?: string;
  signalSources: BacktestSignalSource[];
  executionInstrument: BacktestAssetSymbolRef;
  primaryTimeframe: BacktestTimeframe;
  entry: Expression;
  exit: Expression;
  sizing:
    | { type: 'fixedAmount'; amount: BacktestDecimalString }
    | { type: 'percentOfEquity'; percent: BacktestDecimalString }
    | { type: 'fixedQuantity'; quantity: BacktestDecimalString }
    | { type: 'targetWeight'; weight: BacktestDecimalString };
  risk: Array<
    | { type: 'fixedStop'; percent: BacktestDecimalString }
    | { type: 'fixedTakeProfit'; percent: BacktestDecimalString }
    | { type: 'maxHoldingPeriod'; periods: number }
  >;
  execution:
    | BacktestDailyOrderExecution
    | { mode: 'exchange'; orderType: 'market'; timeInForce: 'DAY'; timing: 'nextEligibleBarOpen' }
    | { mode: 'nav'; requestTypes: Array<'subscribe' | 'redeem'>; timing: 'nextAvailableNav' };
  cost: {
    commissionRate: BacktestDecimalString;
    minimumCommission?: BacktestMoney;
    slippageRate: BacktestDecimalString;
  };
  benchmark?: BacktestAssetSymbolRef;
}

/** AST nodes with explicit output kinds are useful to evaluators and tests. */
export const expressionOutputKind = (expression: Expression): 'numeric' | 'boolean' => {
  switch (expression.type) {
    case 'all':
    case 'any':
    case 'not':
    case 'compare':
    case 'cross':
    case 'corporateActionEvent':
    case 'consecutive':
    case 'sequence':
      return 'boolean';
    default:
      return expression.type === 'positionState' && expression.field === 'isOpen'
        ? 'boolean'
        : 'numeric';
  }
};
import type { BacktestDailyOrderExecution } from './backtest-order-contract.js';
