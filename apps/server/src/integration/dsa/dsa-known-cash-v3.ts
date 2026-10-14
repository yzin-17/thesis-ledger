import {
  marketKnownCashExchangeV3Schema,
  marketKnownCashErrorV3Schema,
  type MarketKnownCashRequestV3,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';
import { mapEventV3HttpError } from './dsa-events-v3.js';

export function parseKnownCashResponseV3(response: unknown, request: MarketKnownCashRequestV3) {
  const parsed = marketKnownCashExchangeV3Schema.safeParse({ request, response });
  if (!parsed.success)
    throw new DsaV3ProtocolError('DSA方案观察与固定请求不一致', 'invalid-response');
  return parsed.data.response;
}

export function mapKnownCashV3HttpError(status: number, payload: unknown, requestId: string) {
  if ([401, 403, 404, 405].includes(status)) return mapEventV3HttpError(status, payload, requestId);
  const parsed = marketKnownCashErrorV3Schema.safeParse(payload);
  if (!parsed.success || parsed.data.requestId !== requestId)
    return new DsaV3ProtocolError('DSA方案错误响应无效', 'invalid-response', status);
  const { error } = parsed.data;
  const mapped = mapEventV3HttpError(
    status,
    {
      contractVersion: 3,
      requestId,
      error: { code: error.code, message: '方案来源失败' },
    },
    requestId,
  );
  return new DsaV3ProtocolError(
    `DSA方案读取失败：${error.reason}`,
    mapped.code,
    status,
    error.reason,
  );
}
