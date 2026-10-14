import { z } from 'zod';

/** 报价读取合同支持的规范市场代码，资产类别单独绑定。 */
export const marketQuoteSymbolSchema = z.string()
  .regex(/^(?:\d{6}\.(?:SH|SZ|BJ)|\d{5}\.HK|\^?[A-Z][A-Z0-9.-]{0,31}\.US)$/)
  .refine((symbol) => symbol !== '00000.HK', '港股证券代码不能为零');
export const quoteAssetTypeSchema = z.enum(['STOCK', 'ETF', 'INDEX']);
export type QuoteAssetType = z.infer<typeof quoteAssetTypeSchema>;
