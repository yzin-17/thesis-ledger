import { createHash } from 'node:crypto';
import {
  canonicalNewsUrlV3,
  correlateMarketNewsV3,
  type MarketNewsRequestV3,
  type MarketNewsResponseV3,
} from '@thesis-ledger/schemas';
import { DsaError } from './dsa-client-errors.js';
import { DsaV3ProtocolError, type DsaV3ErrorCode } from './dsa-v3-protocol.js';

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export function verifyNewsEvidenceIdentity(items: MarketNewsResponseV3['items']) {
  for (const entry of items) {
    const identity = entry.sourceItemId ?? canonicalNewsUrlV3(entry.url);
    const origin =
      entry.originalUrl === null
        ? `content:${entry.contentFingerprint}`
        : `origin:${canonicalNewsUrlV3(entry.originalUrl)}`;
    if (
      entry.id !== `news-item-v1:${hash(`${entry.providerId}:${identity}`)}` ||
      entry.evidenceGroupId !== `news-evidence-v1:${hash(origin)}`
    )
      throw new Error('新闻来源身份或独立证据分组不匹配');
  }
}

/** 服务端核对 DSA 稳定身份；共享 Schema 保持浏览器可用，不引入 Node 加密依赖。 */
export function parseNewsResponseV3(
  raw: unknown,
  request: MarketNewsRequestV3,
): MarketNewsResponseV3 {
  try {
    const response = correlateMarketNewsV3(request, raw);
    verifyNewsEvidenceIdentity(response.items);
    return response;
  } catch {
    throw new DsaV3ProtocolError('DSA 新闻响应未通过 news-search-v1 关联合同', 'invalid-response');
  }
}

/** HTTP 失败仍保留已经校验的来源、覆盖和全部错误，供上层区分未尝试与实源失败。 */
export class DsaNewsError extends DsaError {
  constructor(
    readonly response: MarketNewsResponseV3,
    status: number,
    code: DsaV3ErrorCode,
  ) {
    super('DSA 新闻检索不可用', code, status, response.errors[0]?.code);
  }
}

export function mapNewsV3HttpError(status: number, raw: unknown, request: MarketNewsRequestV3) {
  let response: MarketNewsResponseV3;
  try {
    response = parseNewsResponseV3(raw, request);
  } catch {
    if (status === 401 || status === 403)
      return new DsaV3ProtocolError('DSA 新闻数据接口鉴权失败', 'unauthorized', status);
    if (status === 404 || status === 405)
      return new DsaV3ProtocolError('DSA 不支持新闻 V3', 'unsupported-capability', status);
    return new DsaV3ProtocolError('DSA 新闻错误响应无效', 'invalid-response', status);
  }
  const first = response.errors[0];
  if (response.status !== 'unavailable' || !first)
    return new DsaV3ProtocolError('DSA 新闻 HTTP 状态与结果不一致', 'invalid-response', status);
  const codes: Record<typeof first.code, DsaV3ErrorCode> = {
    not_admitted: 'control-rejected',
    missing_credentials: 'source-authentication-failed',
    configuration_failure: 'unavailable',
    rate_limited: 'unavailable',
    timeout: 'timeout',
    upstream_failure: 'unavailable',
    ambiguous_instrument: 'source-symbol-unrecognized',
    invalid_request: 'invalid-request',
    not_covered: 'insufficient-coverage',
    unsupported: 'unsupported-capability',
  };
  return new DsaNewsError(response, status, codes[first.code]);
}
