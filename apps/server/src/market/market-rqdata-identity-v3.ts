import { createHash } from 'node:crypto';
import {
  validateMarketRqdataIdentityResponseV3,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';

/** 在线及离线均核对原始 UTF-8 字节；审核事实由精确准入另行提供。 */
export function verifyRqdataFundIdentityV3(response: MarketEventResponseV3): void {
  const evidence = response.identityEvidence;
  if (!evidence && response.routeTarget.providerId !== 'rqdata') return;
  if (
    !evidence ||
    Buffer.byteLength(evidence.content, 'utf8') > 1024 * 1024 ||
    createHash('sha256').update(evidence.content, 'utf8').digest('hex') !== evidence.sha256
  )
    throw new Error('RQData 身份原文摘要无效');
  validateMarketRqdataIdentityResponseV3(response);
}
