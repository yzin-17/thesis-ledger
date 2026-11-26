import type { NumericExpression } from './backtest-strategy.js';

export type BacktestOrderValidity =
  { kind: 'DAY' } | { kind: 'bars'; bars: number } | { kind: 'position' };
export type BacktestOrderInstruction =
  { kind: 'market' } | { kind: 'limit' | 'stopMarket'; price: NumericExpression };
export type BacktestOrderAction =
  { kind: 'entry' | 'exit' | 'stopLoss' | 'takeProfit' } | { kind: 'stage'; stageId: string };
export interface BacktestOrderTemplate {
  id: string;
  action: BacktestOrderAction;
  order: BacktestOrderInstruction;
  validity: BacktestOrderValidity;
  parent?: { templateId: string; activation: 'eachFill' | 'fullFill' } | undefined;
  exitGroup?: string | undefined;
}
export interface BacktestDailyOrderExecution {
  mode: 'exchange';
  timing: 'dailyBarOrders';
  orders: BacktestOrderTemplate[];
}
export interface BacktestDailyMatching {
  conflict: 'stopFirst';
  childActivation: 'openSameBarRangeNextBar';
  partialExit: 'protectRemaining';
  liquidity: { kind: 'wholeOrder' } | { kind: 'unlimited' } | { kind: 'perBarCap'; quantity: string };
}
export type BacktestOrderPhase = 'open' | 'range';
export interface BacktestOrderPoint {
  barIndex: number;
  phase: BacktestOrderPhase;
}
export type BacktestOrderState =
  | 'waiting_parent'
  | 'active'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'expired'
  | 'rejected';
export interface BacktestOrderFill {
  fillId: string;
  quantity: string;
  at: BacktestOrderPoint;
}
export interface BacktestDailyOrder {
  id: string;
  templateId: string;
  cycleId: string;
  side: 'buy' | 'sell';
  action: BacktestOrderAction;
  quantityBasis: 'actual-units' | 'normalized-units';
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  acceptedSequence: number;
  validity: BacktestOrderValidity;
  price: { kind: 'market' } | { kind: 'limit' | 'stopMarket'; price: string };
  parent?: { orderId: string; activation: 'eachFill' | 'fullFill' } | undefined;
  exitGroup?: string | undefined;
  state: BacktestOrderState;
  activatedBarIndex?: number | undefined;
  eligibleFrom?: BacktestOrderPoint | undefined;
  triggeredAt?: BacktestOrderPoint | undefined;
  fills: BacktestOrderFill[];
}
