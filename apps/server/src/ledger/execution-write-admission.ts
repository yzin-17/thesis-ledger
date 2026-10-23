import { ConflictException } from '@nestjs/common';
import type { LedgerEvent } from '@thesis-ledger/schemas';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import { inferAssetType } from './asset-type.js';
import { assertSymbolMatchesAssetType, assertWritableAccount } from './ledger.service.js';
import type { AccountLedgerWriteContext } from './ledger-v2.repository.js';

type ExecutionPayloadEvent = Extract<
  LedgerEvent,
  { type: 'BUY_EXECUTION' | 'SELL_EXECUTION'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
>;
const rejected = (message: string, accountId: string) =>
  new ConflictException({ errorCode: 'LEDGER_VALIDATION_FAILED', message, accountId });

/** 幂等重放命中后才进入新写入准入；现有事实的载荷读取不经过本函数。 */
export async function assertExecutionWriteAllowed(
  context: AccountLedgerWriteContext,
  event: ExecutionPayloadEvent,
) {
  if (event.payload.capabilityVerification === 'VERIFIED')
    throw rejected('交易规则尚未验证，不能由客户端将本次成交标记为已验证', context.accountId);
  const account = await context.transaction.account.findUnique({
    where: { id: context.accountId },
  });
  if (!account) throw rejected('账户不存在', context.accountId);
  try {
    assertWritableAccount(account, inferAssetType(event.payload.symbol));
  } catch (error) {
    throw rejected(error instanceof Error ? error.message : '账户不可写', context.accountId);
  }
  const asset = await context.transaction.asset.findUnique({
    where: { symbol: event.payload.symbol },
  });
  if (!asset || asset.identityStatus !== 'confirmed')
    throw rejected('成交资产必须先完成身份确认', context.accountId);
  const assetType = inferAssetType(event.payload.symbol, asset.assetType);
  assertSymbolMatchesAssetType(event.payload.symbol, assetType);
  assertAccountCanHoldAsset(account, assetType);
}
