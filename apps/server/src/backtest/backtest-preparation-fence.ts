import { ConflictException } from '@nestjs/common';
import type { BacktestPreflightRevisionStampV3 } from '@thesis-ledger/schemas';
import type { MarketBarWindowReadResultV3 } from '../market/market-bar-reader-v3.js';

export function preparationStale(): never {
  throw new ConflictException({
    code: 'PREPARATION_STALE',
    message: '准备结果已失效，请重新准备运行配置',
  });
}

export function assertPreparedSelection(
  stamp: BacktestPreflightRevisionStampV3,
  read: MarketBarWindowReadResultV3,
) {
  if (read.status !== 'selected') preparationStale();
  const selection = read.selection;
  const target = stamp.targetSequences[0]?.targets.find(
    (candidate) => candidate.routeIndex === selection.routeIndex,
  );
  if (
    selection.desiredRevision !== stamp.desiredRevision ||
    selection.effectivePolicyRevision !== stamp.effectiveRevision ||
    selection.catalogRevision !== stamp.catalogRevision ||
    target?.providerId !== selection.target.providerId ||
    target?.upstreamSource !== selection.target.upstreamSource
  )
    preparationStale();
}
