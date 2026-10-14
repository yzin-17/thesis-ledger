import { BadRequestException, HttpException } from '@nestjs/common';
import { barSeriesIdentitySchema, type BarSeriesIdentity } from '@thesis-ledger/schemas';
import { inferAssetType } from '../ledger/asset-type.js';
import type { BarReadAcceptance } from './market-bar-reader.js';
import { assertCalendarDateRange } from './market-request-validation.js';
import { requireNativeMarketTimeframe } from './market-period-request.js';

export const parseAcceptance = (value: string | undefined): BarReadAcceptance => {
  if (!value) return 'interactive';
  if (value === 'interactive' || value === 'complete' || value === 'point-in-time') return value;
  throw new BadRequestException('acceptance 必须是 interactive、complete 或 point-in-time');
};

export function marketChartRequest(symbol: string, query: Record<string, string | undefined>) {
  let identity: BarSeriesIdentity;
  try {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const requestedAssetType = query.assetType?.trim().toLowerCase();
    const resolvedAssetType = requestedAssetType ?? inferAssetType(normalizedSymbol);
    const assetType =
      resolvedAssetType === 'fund' ? 'MUTUAL_FUND' : resolvedAssetType?.toUpperCase();
    identity = barSeriesIdentitySchema.parse({
      symbol: normalizedSymbol,
      assetType,
      timeframe: requireNativeMarketTimeframe(query.timeframe, assetType),
      adjustment: query.adjustment ?? 'qfq',
    });
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new BadRequestException('assetType、timeframe 或 adjustment 不支持');
  }
  const limit = query.limit === undefined ? undefined : Number(query.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 3650))
    throw new BadRequestException('limit 必须是 1 到 3650 之间的整数');
  try {
    assertCalendarDateRange(query.start, query.end);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : '日期范围无效');
  }
  if (query.asOf && Number.isNaN(new Date(query.asOf).getTime()))
    throw new BadRequestException('asOf 必须是有效时间');
  return {
    identity,
    window: {
      ...(query.start ? { start: query.start } : {}),
      ...(query.end ? { end: query.end } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
    acceptance: parseAcceptance(query.acceptance),
    refresh: query.refresh === '1',
    ...(query.asOf ? { asOf: query.asOf } : {}),
  } as const;
}
