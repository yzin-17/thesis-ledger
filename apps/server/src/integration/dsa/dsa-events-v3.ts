import {
  marketEventErrorV3Schema,
  marketEventExchangeV3Schema,
  type MarketEventRequestV3,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError, type DsaV3ErrorCode } from './dsa-v3-protocol.js';

export const parseEventResponseV3 = (response: unknown, request: MarketEventRequestV3) => {
  const parsed = marketEventExchangeV3Schema.safeParse({ request, response });
  if (!parsed.success)
    throw new DsaV3ProtocolError('DSA 事件响应与固定请求不一致', 'invalid-response');
  return parsed.data.response;
};

export const mapEventV3HttpError = (status: number, payload: unknown, requestId: string) => {
  if (status === 401 || status === 403) {
    return new DsaV3ProtocolError('DSA 事件接口鉴权失败', 'unauthorized', status);
  }
  if (status === 404 || status === 405) {
    return new DsaV3ProtocolError('DSA 不支持事件 V3', 'unsupported-capability', status);
  }
  const parsed = marketEventErrorV3Schema.safeParse(payload);
  if (!parsed.success || parsed.data.requestId !== requestId) {
    return new DsaV3ProtocolError('DSA 事件错误响应无效', 'invalid-response', status);
  }
  const codes: Record<typeof parsed.data.error.code, DsaV3ErrorCode> = {
    invalid_request: 'control-rejected',
    not_adapted: 'unsupported-capability',
    not_admitted: 'control-rejected',
    policy_not_applied: 'stale-revision',
    invalid_response: 'invalid-response',
    upstream_failure: 'unavailable',
  };
  return new DsaV3ProtocolError('DSA 事件来源不可用', codes[parsed.data.error.code], status);
};
