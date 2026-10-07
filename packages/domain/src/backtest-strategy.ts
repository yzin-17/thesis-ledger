/**
 * Runtime-facing simulation vocabulary. Validation and JSON boundaries live
 * in @thesis-ledger/schemas; these structural types keep the simulation domain
 * independent from Zod.
 */

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
  | { type: 'constant'; value: BacktestDecimalString }
  | { type: 'series'; sourceId: string; field: BacktestSeriesField }
  | {
      type: 'indicator';
      name: 'MA' | 'EMA' | 'RSI' | 'MACD' | 'ATR' | 'VWAP' | 'Highest' | 'Lowest';
      input: NumericExpression;
      params: Record<string, number | BacktestDecimalString>;
      output?: 'macd' | 'signal' | 'histogram';
    }
  | { type: 'positionState'; field: 'quantity' | 'averageCost' | 'holdingPeriods' };

export type BooleanExpression =
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
  schemaVersion: '2';
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
      return 'boolean';
    default:
      return expression.type === 'positionState' && expression.field === 'isOpen'
        ? 'boolean'
        : 'numeric';
  }
};
