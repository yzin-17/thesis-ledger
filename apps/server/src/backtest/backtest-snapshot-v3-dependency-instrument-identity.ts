import type {
  BacktestInstrumentType,
  BacktestMarket,
  BacktestStrategy,
} from '@thesis-ledger/schemas';
import {
  SnapshotDependencyV3Error,
  type SnapshotDependencyV3ErrorReason,
} from './backtest-snapshot-v3-dependency-error.js';

const instrumentTypeByAssetType = {
  stock: 'STOCK',
  etf: 'ETF',
  fund: 'NAV_FUND',
} as const;

function fail(reason: SnapshotDependencyV3ErrorReason, message: string): never {
  throw new SnapshotDependencyV3Error(reason, message);
}

export const instrumentIdentity = (
  value: string,
): {
  market: BacktestMarket;
  symbol: string;
  assetType: keyof typeof instrumentTypeByAssetType;
  instrumentType: BacktestInstrumentType;
} => {
  const parts = value.split(':');
  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    !parts[2] ||
    /[\\/]/.test(parts[1]) ||
    [...parts[1]].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    return fail('request_scope_invalid', `Snapshot V3 依赖标的身份无效: ${value}`);
  }
  const [marketValue, symbol, assetTypeValue] = parts;
  if (marketValue !== 'CN' && marketValue !== 'HK' && marketValue !== 'US') {
    return fail('request_scope_invalid', `Snapshot V3 依赖市场无效: ${value}`);
  }
  if (assetTypeValue !== 'stock' && assetTypeValue !== 'etf' && assetTypeValue !== 'fund') {
    return fail('request_scope_invalid', `Snapshot V3 依赖资产类型无效: ${value}`);
  }
  return {
    market: marketValue,
    symbol,
    assetType: assetTypeValue,
    instrumentType: instrumentTypeByAssetType[assetTypeValue],
  };
};

export const identityForAsset = (asset: BacktestStrategy['executionInstrument']): string =>
  `${asset.market}:${asset.symbol}:${asset.assetType}`;
