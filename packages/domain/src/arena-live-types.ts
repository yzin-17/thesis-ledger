export interface ArenaPaperOrder {
  id: string;
  clientId: string;
  symbol: string;
  side: 'buy' | 'sell';
  kind: 'market' | 'limit' | 'stop_loss' | 'take_profit';
  quantity: string;
  price: string | null;
  expiresOn: string | null;
  exitGroup: string | null;
  createdAt: string;
  activeSince: string;
  expiresAt: string;
  state: 'active' | 'filled' | 'cancelled' | 'expired' | 'rejected';
  reservedCash: string;
  reason: string | null;
}
export type ArenaPaperCondition =
  | { kind: 'time'; at: string }
  | { kind: 'price'; symbol: string; operator: 'gte' | 'lte'; price: string }
  | { kind: 'fill'; symbol: string | null };
export interface ArenaPaperWakeup {
  id: string;
  condition: ArenaPaperCondition;
  createdAt: string;
  firedAt: string | null;
}
export interface ArenaPaperFill {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  fee: string;
  cashDelta: string;
  marketTime: string;
  recordedAt: string;
  sourceRef: string;
  evidence: unknown;
}
export interface ArenaPaperAccount {
  revision: number;
  cash: string;
  positions: { symbol: string; quantity: string; acquiredOn: string; availableOn: string }[];
  cashSettlements: { amount: string; availableOn: string }[];
  orders: ArenaPaperOrder[];
  wakeups: ArenaPaperWakeup[];
  watchedSymbols: string[];
  fills: ArenaPaperFill[];
}
export interface ArenaPaperQuote {
  symbol: string;
  price: string;
  marketTime: string;
  observedAt: string;
  sourceRef: string;
  evidence: unknown;
  tradingDate: string;
  positionAvailableOn: string;
  cashAvailableOn: string;
  lot: string;
  tick: string;
  priceStep?: ((price: string) => string) | undefined;
  buyBlocked: string | null;
  sellBlocked: string | null;
  upperLimit?: string | undefined;
  lowerLimit?: string | undefined;
  statutoryBuyFee: (turnover: string, quantity: string, price: string) => string;
  statutorySellFee: (turnover: string, quantity: string, price: string) => string;
}
export interface ArenaPaperFees {
  buyBps: number;
  sellBps: number;
  minimum: string;
  slippageBps: number;
}
export interface ArenaPaperDecision {
  summary: string;
  orders: Omit<ArenaPaperOrder, 'id' | 'createdAt' | 'activeSince' | 'expiresAt' | 'state' | 'reservedCash' | 'reason'>[];
  cancelOrderIds: string[];
  wakeups: ArenaPaperCondition[];
  watchedSymbols: string[];
}
export interface ArenaPaperContext {
  at: string;
  tradingDate: string;
  fees: ArenaPaperFees;
  maxPositionBps: number;
  maxActiveSymbols: number;
  allowedSymbols: ReadonlySet<string>;
  quotes: readonly ArenaPaperQuote[];
  expiresAt: (day: string | null, kind?: ArenaPaperOrder['kind']) => string;
  newId: () => string;
}
