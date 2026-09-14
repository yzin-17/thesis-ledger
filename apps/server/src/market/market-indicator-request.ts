export type MarketIndicatorRequestOptions = {
  refresh?: boolean;
  start?: string;
  end?: string;
  limit?: number;
  parameters?: Readonly<Record<string, number>>;
  calculationAnchor?: string;
};

export const validateIndicatorLimit = (limit?: number) => {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 365))
    throw new BadRequestException('indicator limit 必须是 1 到 365 之间的整数');
};

export const buildIndicatorRequest = (
  symbol: string,
  name: 'MA' | 'MACD' | 'RSI' | 'ATR',
  options: MarketIndicatorRequestOptions,
) => {
  const parameters = Object.fromEntries(
    Object.entries(options.parameters ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
  const query = new URLSearchParams({
    symbol,
    timeframe: '1d',
    ...(options.start ? { start: options.start } : {}),
    ...(options.end ? { end: options.end } : {}),
    ...(options.limit ? { limit: String(options.limit) } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters: JSON.stringify(parameters) } : {}),
    ...(options.calculationAnchor ? { calculationAnchor: options.calculationAnchor } : {}),
  });
  return {
    parameters,
    key: `indicator:${symbol}:${name}:${JSON.stringify({
      start: options.start ?? null,
      end: options.end ?? null,
      limit: options.limit ?? null,
      parameters,
      calculationAnchor: options.calculationAnchor ?? null,
    })}`,
    path: `/api/v1/thesis-ledger/market/indicators/${name.toLowerCase()}?${query.toString()}`,
  };
};
import { BadRequestException } from '@nestjs/common';
