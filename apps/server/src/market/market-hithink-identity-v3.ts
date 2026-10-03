import { createHash } from 'node:crypto';
import {
  isMarketHithinkCashIdentityRouteV3,
  validateMarketHithinkIdentityResponseV3,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';

/** 在线及离线按原始 UTF-8 字节复核证据摘要。 */
export function verifyHithinkFundIdentityV3(response: MarketEventResponseV3): void {
  const evidence = response.hithinkIdentityEvidence;
  if (!isMarketHithinkCashIdentityRouteV3(response) && !evidence) return;
  if (
    !evidence ||
    Buffer.byteLength(evidence.content, 'utf8') > 1024 * 1024 ||
    createHash('sha256').update(evidence.content, 'utf8').digest('hex') !== evidence.sha256
  )
    throw new Error('HiThink 身份原文摘要无效');
  validateMarketHithinkIdentityResponseV3(response);
}
