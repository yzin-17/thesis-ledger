export type ArenaProtectionValidity = { kind: 'activation_session_close' } | { kind: 'date'; expiresOn: string };
export type ArenaExitQuantity = { basis: 'parent_open_quantity' } |
  { basis: 'parent_filled_fraction'; numerator: number; denominator: number };
export interface ArenaTrailingStop {
  priceSource: 'executable_quote'; reference: 'highest_since_activation';
  distance: { kind: 'amount' | 'percent'; value: string };
  breakEven: { triggerGainPercent: string; reference: 'gross_average_entry_price' } | null;
}
export interface ArenaFillProtection {
  activation: 'on_full_fill' | 'on_each_fill';
  afterExit?: 'cancel_entry_remainder' | 'keep_entry_remainder' | undefined;
  exitPolicy?: 'single' | 'oco' | 'staged' | undefined;
  activateOrders: { clientId: string; side: 'sell'; kind: 'stop_loss' | 'take_profit'; price: string;
    exitGroup?: string | null | undefined;
    quantity: ArenaExitQuantity; trailing?: ArenaTrailingStop | null | undefined;
    reduceOnly: true; validUntil: ArenaProtectionValidity }[];
}
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
  entryAfter?: { clientId: string; activation: 'on_full_fill' } | null | undefined;
  onFill?: ArenaFillProtection | null | undefined;
  parentOrderId?: string | null | undefined;
  activationOrderId?: string | undefined;
  quantityLot?: string | undefined;
  exitQuantity?: ArenaExitQuantity | undefined;
  trailing?: ArenaTrailingStop | null | undefined;
  trailingState?: { highWater: string; entryPrice: string; triggerPrice: string; marketTime: string; triggered: boolean } | undefined;
  triggeredAt?: string | undefined;
  validUntil?: ArenaProtectionValidity | null | undefined;
  createdAt: string;
  activeSince: string;
  expiresAt: string;
  state: 'waiting_parent' | 'waiting_entry' | 'active' | 'filled' | 'cancelled' | 'expired' | 'rejected';
  reservedCash: string;
  filledQuantity?: string | undefined;
  remainingQuantity?: string | undefined;
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
  positions: { symbol: string; quantity: string; acquiredOn: string; availableOn: string; entryOrderId?: string | null | undefined }[];
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
  orders: Omit<ArenaPaperOrder, 'id' | 'createdAt' | 'activeSince' | 'expiresAt' | 'state' | 'reservedCash' | 'reason' | 'parentOrderId' | 'validUntil' | 'filledQuantity' | 'remainingQuantity' | 'activationOrderId' | 'quantityLot' | 'exitQuantity' | 'trailing' | 'trailingState' | 'triggeredAt'>[];
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
  valuationPrices?: ReadonlyMap<string, string>;
  expiresAt: (day: string | null, kind?: ArenaPaperOrder['kind']) => string;
  newId: () => string;
  matching?: { kind: 'simulated_volume'; maxSharesPerObservation: string } | undefined;
}
