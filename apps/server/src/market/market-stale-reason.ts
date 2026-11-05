import { ZodError } from 'zod';
import type { MarketStaleReason } from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';

/** 只投影结构化原因，不向业务响应透传原始异常或来源地址。 */
export function marketStaleReason(error: unknown): MarketStaleReason {
  let code: MarketStaleReason['code'] = 'unknown';
  let httpStatus: number | undefined;
  if (error instanceof ZodError) code = 'invalid_response';
  if (error instanceof DsaError) {
    if (error.status && error.status >= 400 && error.status <= 599) httpStatus = error.status;
    if (error.code === 'timeout') code = 'timeout';
    else if (error.status === 429 || error.sourceReason === 'rate_limited') code = 'rate_limited';
    else if (error.code === 'unauthorized' || error.code === 'source-authentication-failed')
      code = 'unauthorized';
    else if (error.code === 'permission-denied' || error.status === 403) code = 'permission_denied';
    else if (error.code === 'invalid-response') code = 'invalid_response';
    else if (error.code === 'control-rejected' || error.code === 'stale-revision')
      code = 'control_rejected';
    else code = 'source_unavailable';
  }
  const messages: Record<MarketStaleReason['code'], string> = {
    timeout: '数据源请求超时，当前展示上次成功取得的数据。',
    rate_limited: '数据源限制了请求频率，当前展示上次成功取得的数据。',
    unauthorized: '数据源认证失败，当前展示上次成功取得的数据。',
    permission_denied: '数据源拒绝访问或当前账户权限不足，当前展示上次成功取得的数据。',
    invalid_response: '数据源响应格式校验失败，当前展示上次成功取得的数据。',
    control_rejected: '数据源配置或控制版本已变化，本次刷新未能完成。',
    source_unavailable: '数据源请求失败，当前展示上次成功取得的数据。',
    unknown: '本次刷新失败，来源未提供可识别的具体原因；当前展示上次成功取得的数据。',
  };
  return { code, message: messages[code], ...(httpStatus ? { httpStatus } : {}) };
}
