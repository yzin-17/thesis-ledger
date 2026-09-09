/**
 * Runtime-facing V2 vocabulary. Validation and JSON boundaries live in
 * @thesis-ledger/schemas; these structural types keep the simulation domain
 * independent from Zod and from the V1 engine.
 */

export type BacktestTimeframe = '1d' | '60m' | '30m' | '15m' | '5m' | '1m';
export type V2BacktestMarket = 'CN' | 'HK' | 'US';
export type BacktestAssetType = 'stock' | 'etf' | 'fund';
export type BacktestCurrency = 'CNY' | 'HKD' | 'USD';
export type BacktestSeriesField = 'open' | 'high' | 'low' | 'close' | 'volume' | 'nav';

export interface BacktestAssetSymbolRef {
  symbol: string;
  market: V2BacktestMarket;
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
  | { type: 'positionState'; field: 'isOpen' };

export type Expression = NumericExpression | BooleanExpression;

export interface StrategySchemaV2 {
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

export interface PortfolioValuationPolicy {
  baseTimezone: string;
  dailyValuationTime: string;
  pricePolicy: 'latestAvailable';
  fxPolicy: 'latestAvailable';
}

export interface RunConfig {
  startDate: string;
  endDate: string;
  dataAsOf: string;
  baseCurrency: BacktestCurrency;
  initialCash: Partial<Record<BacktestCurrency, BacktestDecimalString>>;
  valuationPolicy: PortfolioValuationPolicy;
}

export interface SimulationFill {
  fillId: string;
  executionSymbol: string;
  side: 'buy' | 'sell';
  quantity: BacktestDecimalString;
  price: BacktestDecimalString;
  charges: BacktestMoney[];
  occurredAt: string;
  reason: 'signal' | 'risk';
}

export interface BacktestError {
  code: string;
  message: string;
  path: Array<string | number>;
  details?: Record<string, unknown>;
}

export interface BacktestTradeV2 {
  source: 'BACKTEST';
  executionSymbol: string;
  openedAt: string;
  closedAt: string;
  entryQuantity: BacktestDecimalString;
  exitQuantity: BacktestDecimalString;
  entryValue: BacktestMoney;
  exitValue: BacktestMoney;
  realizedPnl: BacktestMoney;
  charges: BacktestMoney[];
  returnRate: BacktestDecimalString;
  closeReason: 'signal' | 'risk';
  fillIds: string[];
}

export interface BacktestMetric {
  status: 'available' | 'unavailable' | 'warning';
  value?: BacktestDecimalString;
  reason?: string;
}

export interface BacktestResultV2 {
  source: 'BACKTEST';
  runId: string;
  strategyVersionId: string;
  snapshotId: string;
  engineVersion: string;
  schemaVersion: '2';
  marketRuleVersion: string;
  calendarVersion: string;
  aggregationVersion: string;
  contentHash: string;
  resultChecksum: string;
  completeness: 'complete' | 'partial' | 'unavailable';
  warnings: string[];
  rejectedOrders: Array<Record<string, unknown>>;
  simulationFills: SimulationFill[];
  trades: BacktestTradeV2[];
  equityCurve: Array<{ occurredAt: string; value: BacktestMoney; availableAt?: string }>;
  metrics: Record<string, BacktestMetric>;
  benchmark?: Record<string, BacktestMetric>;
}

/** AST nodes with explicit output kinds are useful to evaluators and tests. */
export const expressionOutputKind = (expression: Expression): 'numeric' | 'boolean' => {
  switch (expression.type) {
    case 'all':
    case 'any':
    case 'not':
    case 'compare':
    case 'cross':
      return 'boolean';
    default:
      return expression.type === 'positionState' && expression.field === 'isOpen'
        ? 'boolean'
        : 'numeric';
  }
};
