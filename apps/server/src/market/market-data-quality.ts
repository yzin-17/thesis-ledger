import { ZodError } from 'zod';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import type { DataQualityService } from '../quality/data-quality.service.js';
import type { DataQualityObservation } from '../quality/data-quality-observation.js';
import { MarketDataIdentityError } from './market-current-data.js';

export type MarketQualityContext = Omit<DataQualityObservation, 'code'>;

/** 只观察现有响应校验；输入、网络、控制与取消错误保持原路径。 */
export async function readWithDataQuality<T>(
  quality: DataQualityService | undefined,
  context: MarketQualityContext,
  read: () => T | Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    let code: DataQualityObservation['code'] | undefined;
    if (error instanceof MarketDataIdentityError) code = 'response_identity_mismatch';
    else if (error instanceof ZodError) code = 'response_schema_invalid';
    else if (error instanceof DsaV3ProtocolError && error.code === 'invalid-response')
      code = 'response_contract_invalid';
    if (code && quality) {
      // 记录是旁路观察，即使替换的记录器抛错也不覆盖原错误。
      try {
        await quality.observe({ ...context, code });
      } catch {
        /* 原错误继续向上传递。 */
      }
    }
    throw error;
  }
}
