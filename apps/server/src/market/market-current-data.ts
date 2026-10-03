import {
  quoteSchema,
  fundNavSchema,
  fundHoldingsSchema,
  chipDistributionSchema,
} from '@thesis-ledger/schemas';

const requireSymbol = (actual: string, expected: string) => {
  if (actual !== expected) throw new Error('行情响应代码与请求不一致');
};

export const parseCurrentQuote = (value: unknown, symbol: string) => {
  const parsed = quoteSchema.parse(value);
  requireSymbol(parsed.symbol, symbol);
  return parsed;
};

export const parseCurrentFundNav = (value: unknown, symbol: string) => {
  const parsed = fundNavSchema.parse(value);
  requireSymbol(parsed.symbol, symbol);
  return parsed;
};

export const parseCurrentFundHoldings = (value: unknown, symbol: string) => {
  const parsed = fundHoldingsSchema.parse(value);
  requireSymbol(parsed.fundSymbol, symbol);
  return parsed;
};

export const parseCurrentChip = (value: unknown, symbol: string) => {
  const parsed = chipDistributionSchema.parse(value);
  requireSymbol(parsed.symbol, symbol);
  return parsed;
};
