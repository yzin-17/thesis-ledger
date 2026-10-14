import { BadRequestException, HttpException } from '@nestjs/common';
import { marketTimeframeSchema } from '@thesis-ledger/schemas';

export function parseMarketTimeframe(value: string | undefined) {
  const parsed = marketTimeframeSchema.safeParse(value ?? '1d');
  if (!parsed.success)
    throw new BadRequestException({
      error: 'market_timeframe_invalid',
      message: '行情周期不支持',
      details: { requestedTimeframe: value },
    });
  return parsed.data;
}

export function requireNativeMarketTimeframe(
  value: string | undefined,
  assetType: string | undefined,
): '1m' | '1d' {
  const timeframe = parseMarketTimeframe(value);
  if (timeframe === '1m' || timeframe === '1d') return timeframe;
  const supportedAsset = assetType === 'STOCK' || assetType === 'ETF';
  if (!supportedAsset) {
    throw new HttpException(
      {
        error: 'market_period_asset_unsupported',
        message: '当前资产不支持派生行情周期',
        details: { requestedTimeframe: timeframe, assetType: assetType ?? 'UNKNOWN' },
      },
      422,
    );
  }
  throw new HttpException(
    {
      error: 'market_period_unavailable',
      message: '该行情周期尚未完成数据装配',
      details: { requestedTimeframe: timeframe, assetType, reason: 'aggregation_not_assembled' },
    },
    503,
  );
}
