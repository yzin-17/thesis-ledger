import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import type { MarketWindowAttemptFailureV3 } from './market-window-selector-v3.js';

/** 来源拒绝提供覆盖证明时，保留覆盖不足语义，不推断为来源未就绪。 */
export const marketWindowReadFailureV3 = (error: unknown): MarketWindowAttemptFailureV3 => {
  if (error instanceof DsaV3ProtocolError && error.code === 'insufficient-coverage') {
    return 'missing_window';
  }
  return 'fetch_failed';
};
