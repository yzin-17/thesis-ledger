import { createHash } from 'node:crypto';
import {
  isMarketTushareCashIdentityRouteV3,
  validateMarketTushareIdentityResponseV3,
  type MarketEventResponseV3,
} from '@thesis-ledger/schemas';

/** 在线及离线核对原始 UTF-8 字节；当前审核和修订由生产入口另行复核。 */
export function verifyTushareFundIdentityV3(response: MarketEventResponseV3): void {
  const evidence = response.tushareIdentityEvidence;
  if (!isMarketTushareCashIdentityRouteV3(response) && !evidence) return;
  if (
    !evidence ||
    Buffer.byteLength(evidence.content, 'utf8') > 1024 * 1024 ||
    createHash('sha256').update(evidence.content, 'utf8').digest('hex') !== evidence.sha256
  )
    throw new Error('Tushare 身份原文摘要无效');
  validateMarketTushareIdentityResponseV3(response);
}
