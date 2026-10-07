import type { BacktestDecimalString, BacktestMoney } from './backtest-strategy.js';
export interface PortfolioValuationPolicy {
  baseTimezone: string;
  dailyValuationTime: string;
  pricePolicy: 'latestAvailable';
  fxPolicy: 'latestAvailable';
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

export interface SimulationTrade {
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
