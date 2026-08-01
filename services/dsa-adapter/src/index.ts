export interface QuantCapabilityContract {
  quote(symbol: string): Promise<unknown>;
  bars(symbol: string, timeframe: '1m' | '1d'): Promise<unknown[]>;
  indicator(symbol: string, name: 'MA' | 'MACD' | 'RSI' | 'ATR'): Promise<unknown>;
  chip(symbol: string): Promise<unknown>;
}

export const DSA_PROVIDER_ID = 'dsa-fork';
export * from './provider.js';
export * from './credentials.js';
export * from './trading-calendar.js';
export * from './professional.js';
