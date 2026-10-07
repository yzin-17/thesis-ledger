import { z } from 'zod';
import { decimalStringSchema } from './monetary-values.js';
export const backtestTimeframeSchema = z.enum(['1d', '60m', '30m', '15m', '5m', '1m']);
export const strategyMarketSchema = z.enum(['CN', 'HK', 'US']);
export const backtestAssetTypeSchema = z.enum(['stock', 'etf', 'fund']);
export const backtestCurrencySchema = z.enum(['CNY', 'HKD', 'USD']);
export const seriesFieldSchema = z.enum(['open', 'high', 'low', 'close', 'volume', 'nav']);

export type Timeframe = z.infer<typeof backtestTimeframeSchema>;
export type StrategyMarket = z.infer<typeof strategyMarketSchema>;
export type BacktestAssetType = z.infer<typeof backtestAssetTypeSchema>;
export type BacktestCurrency = z.infer<typeof backtestCurrencySchema>;
export type SeriesField = z.infer<typeof seriesFieldSchema>;
export type BacktestDecimalString = z.infer<typeof decimalStringSchema>;

export const backtestMoneySchema = z
  .object({ amount: decimalStringSchema, currency: backtestCurrencySchema })
  .strict();
export type BacktestMoney = z.infer<typeof backtestMoneySchema>;

export const assetSymbolRefSchema = z
  .object({
    symbol: z.string().trim().min(1),
    market: strategyMarketSchema,
    assetType: backtestAssetTypeSchema,
  })
  .strict();
export type AssetSymbolRef = z.infer<typeof assetSymbolRefSchema>;

export const seriesRefSchema = z
  .object({ sourceId: z.string().trim().min(1), field: seriesFieldSchema })
  .strict();
export type SeriesRef = z.infer<typeof seriesRefSchema>;

export const signalSourceSchema = z
  .object({
    id: z.string().trim().min(1),
    asset: assetSymbolRefSchema,
    timeframe: backtestTimeframeSchema,
    series: z.array(seriesFieldSchema).min(1),
  })
  .strict();
export type SignalSource = z.infer<typeof signalSourceSchema>;

export const currencyForMarket: Record<StrategyMarket, BacktestCurrency> = {
  CN: 'CNY',
  HK: 'HKD',
  US: 'USD',
};
