import {
  marketKnownCashControlExchangeV3Schema,
  marketKnownCashControlErrorV3Schema,
  type MarketKnownCashControlRequestV3,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';
import { mapEventV3HttpError } from './dsa-events-v3.js';

export function parseKnownCashControlResponseV3(
  response: unknown,
  request: MarketKnownCashControlRequestV3,
) {
  const parsed = marketKnownCashControlExchangeV3Schema.safeParse({ request, response });
  if (!parsed.success)
    throw new DsaV3ProtocolError('DSA现金控制复核与固定请求不一致', 'invalid-response');
  return parsed.data.response;
}

export function mapKnownCashControlV3HttpError(
  status: number,
  payload: unknown,
  requestId: string,
) {
  if ([401, 403, 404, 405].includes(status)) return mapEventV3HttpError(status, payload, requestId);
  const parsed = marketKnownCashControlErrorV3Schema.safeParse(payload);
  if (!parsed.success || parsed.data.requestId !== requestId)
    return new DsaV3ProtocolError('DSA现金控制复核错误响应无效', 'invalid-response', status);
  const { error } = parsed.data;
  const mapped = mapEventV3HttpError(
    status,
    {
      contractVersion: 3,
      requestId,
      error: { code: error.code, message: '控制复核失败' },
    },
    requestId,
  );
  return new DsaV3ProtocolError(
    `DSA现金控制复核失败：${error.reason}`,
    mapped.code,
    status,
    error.reason,
  );
}
