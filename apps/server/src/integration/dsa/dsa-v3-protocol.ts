import {
  effectiveProviderPolicyV3Schema,
  marketChartBarsRequestResponseV3Schema,
  type MarketChartBarsRequestV3,
  marketControlHandshakeResponseV3Schema,
  marketControlPolicyApplyRequestV3Schema,
  marketControlPolicyApplyResponseV3Schema,
  marketControlUnsupportedVersionErrorV3Schema,
  marketRouteCatalogV3Schema,
  marketDataBarSeriesRequestResponseV3Schema,
  marketDataBarSeriesRequestV3Schema,
  marketDataContractCapabilitiesV3Schema,
  marketDataErrorCodeV3,
  marketDataErrorEnvelopeV3Schema,
  type MarketControlPolicyApplyRequestV3,
  type MarketDataBarSeriesRequestV3,
  type MarketDataBarSeriesResponseV3,
  type MarketDataContractCapabilitiesV3,
  type MarketRouteCatalogV3,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { parseMultiWindowResponseV3 } from './dsa-multi-window-v3-protocol.js';

export type DsaV3ErrorCode =
  | 'timeout'
  | 'unavailable'
  | 'invalid-response'
  | 'unauthorized'
  | 'unsupported-capability'
  | 'insufficient-coverage'
  | 'control-rejected'
  | 'stale-revision';

export class DsaV3ProtocolError extends Error {
  constructor(
    message: string,
    readonly code: DsaV3ErrorCode,
    readonly status?: number,
  ) {
    super(message);
  }
}

const invalidResponse = (message: string, status?: number) =>
  new DsaV3ProtocolError(message, 'invalid-response', status);

const effectivePolicyEnvelopeV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  projection: z
    .strictObject({
      effective: effectiveProviderPolicyV3Schema,
    })
    .nullable(),
});
export type EffectivePolicyEnvelopeV3 = z.infer<typeof effectivePolicyEnvelopeV3Schema>;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

const sameJsonValue = (left: unknown, right: unknown) =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

export const parseControlHandshakeResponseV3 = (raw: unknown, requestId: string) => {
  const parsed = marketControlHandshakeResponseV3Schema.safeParse(raw);
  if (!parsed.success || parsed.data.requestId !== requestId) {
    throw invalidResponse('DSA Control V3 握手响应无效');
  }
  return parsed.data;
};

export const parseControlPolicyApplyResponseV3 = (
  raw: unknown,
  request: MarketControlPolicyApplyRequestV3,
) => {
  const validatedRequest = marketControlPolicyApplyRequestV3Schema.parse(request);
  const parsed = marketControlPolicyApplyResponseV3Schema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.requestId !== validatedRequest.requestId ||
    !sameJsonValue(parsed.data.desired, validatedRequest) ||
    !effectiveRoutesMatchDesired(parsed.data.effective, validatedRequest)
  ) {
    throw invalidResponse('DSA Control V3 Policy Apply 响应无效');
  }
  return parsed.data;
};

const effectiveRoutesMatchDesired = (
  effective: z.infer<typeof effectiveProviderPolicyV3Schema>,
  desired: MarketControlPolicyApplyRequestV3,
) => {
  if (effective.enabled !== desired.enabled || effective.routes.length !== desired.routes.length) {
    return false;
  }
  return desired.routes.every((desiredRoute, routeIndex) => {
    const effectiveRoute = effective.routes[routeIndex];
    if (
      !effectiveRoute ||
      !sameJsonValue(effectiveRoute.key, desiredRoute.key) ||
      effectiveRoute.targets.length !== desiredRoute.targets.length
    ) {
      return false;
    }
    return desiredRoute.targets.every((desiredTarget, targetIndex) => {
      const effectiveTarget = effectiveRoute.targets[targetIndex];
      return (
        effectiveTarget !== undefined &&
        effectiveTarget.routeIndex === targetIndex &&
        effectiveTarget.providerId === desiredTarget.providerId &&
        effectiveTarget.upstreamSource === desiredTarget.upstreamSource
      );
    });
  });
};

export const parseEffectivePolicyEnvelopeV3 = (raw: unknown): EffectivePolicyEnvelopeV3 => {
  const parsed = effectivePolicyEnvelopeV3Schema.safeParse(raw);
  if (!parsed.success) throw invalidResponse('DSA Control V3 Effective Policy 响应无效');
  return parsed.data;
};

export const parseDataCapabilitiesV3 = (raw: unknown): MarketDataContractCapabilitiesV3 => {
  const parsed = marketDataContractCapabilitiesV3Schema.safeParse(raw);
  if (!parsed.success) throw invalidResponse('DSA Data V3 能力响应无效');
  return parsed.data;
};

export const parseMarketRouteCatalogV3 = (raw: unknown): MarketRouteCatalogV3 => {
  const parsed = marketRouteCatalogV3Schema.safeParse(raw);
  if (!parsed.success) throw invalidResponse('DSA Control V3 精确路由能力目录响应无效');

  if (parsed.data.integrity === 'partial') {
    return { ...parsed.data, entries: [] };
  }
  return parsed.data;
};

export const parseBarSeriesResponseV3 = (
  raw: unknown,
  request: MarketDataBarSeriesRequestV3,
  multiWindowProtocol?: string,
): MarketDataBarSeriesResponseV3 => {
  if (isRecord(raw) && 'windowObservations' in raw) {
    try {
      return parseMultiWindowResponseV3(raw, request, multiWindowProtocol);
    } catch {
      throw invalidResponse('DSA Data V3 多窗口证据、指纹或协议能力无效');
    }
  }
  const validatedRequest = marketDataBarSeriesRequestV3Schema.parse(request);
  const associated = marketDataBarSeriesRequestResponseV3Schema.safeParse({
    request: validatedRequest,
    response: raw,
  });
  if (
    !associated.success ||
    associated.data.response.coverage.requestedStart !== validatedRequest.start ||
    associated.data.response.coverage.requestedEnd !== validatedRequest.end
  ) {
    throw invalidResponse('DSA Data V3 BarSeries 响应与请求不匹配');
  }
  return associated.data.response;
};

export const parseChartBarsResponseV3 = (raw: unknown, request: MarketChartBarsRequestV3) => {
  const associated = marketChartBarsRequestResponseV3Schema.safeParse({ request, response: raw });
  if (!associated.success) throw invalidResponse('DSA 图表 V3 响应与请求不匹配');
  return associated.data.response;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const errorDetail = (payload: unknown): unknown =>
  isRecord(payload) && 'detail' in payload ? payload.detail : payload;

const controlUnsupportedError = (detail: unknown, expectedRequestId?: string, status?: number) => {
  const parsed = marketControlUnsupportedVersionErrorV3Schema.safeParse(detail);
  if (!parsed.success || (expectedRequestId && parsed.data.requestId !== expectedRequestId)) {
    return invalidResponse('DSA Control V3 版本错误响应无效');
  }
  return new DsaV3ProtocolError(parsed.data.message, 'unsupported-capability', status);
};

export const mapControlV3HttpError = (
  status: number,
  payload: unknown,
  expectedRequestId?: string,
) => {
  const detail = errorDetail(payload);
  const code = isRecord(detail) ? detail.code : undefined;
  const message = isRecord(detail) && typeof detail.message === 'string' ? detail.message : '';

  if (code === 'CONTROL_CONTRACT_UNSUPPORTED') {
    return controlUnsupportedError(detail, expectedRequestId, status);
  }
  if (code === 'unauthorized' || status === 401 || status === 403) {
    return new DsaV3ProtocolError(message || 'DSA Control Token 无效', 'unauthorized', status);
  }
  if (code === 'STALE_REVISION') {
    return new DsaV3ProtocolError(
      message || 'DSA Policy revision 已过期',
      'stale-revision',
      status,
    );
  }
  if (code === 'unsupported_capability' || status === 404 || status === 405) {
    return new DsaV3ProtocolError(
      message || 'DSA 不支持 Control Contract V3',
      'unsupported-capability',
      status,
    );
  }
  if (status === 409 || status === 422) {
    return new DsaV3ProtocolError(message || 'DSA Control 拒绝请求', 'control-rejected', status);
  }
  return new DsaV3ProtocolError(message || 'DSA Control 暂时不可用', 'unavailable', status);
};

const marketDataV3ErrorCodes = new Set<string>(Object.values(marketDataErrorCodeV3));

export const mapDataV3HttpError = (
  status: number,
  payload: unknown,
  expectedRequestId?: string,
) => {
  const detail = errorDetail(payload);
  const errorValue = isRecord(detail) ? detail.error : undefined;
  const code = isRecord(errorValue) ? errorValue.code : undefined;

  if (
    marketDataV3ErrorCodes.has(typeof code === 'string' ? code : '') ||
    (isRecord(detail) && detail.contractVersion === 3)
  ) {
    const parsed = marketDataErrorEnvelopeV3Schema.safeParse(detail);
    if (!parsed.success || (expectedRequestId && parsed.data.requestId !== expectedRequestId)) {
      return invalidResponse('DSA Data V3 错误响应无效', status);
    }
    const { error } = parsed.data;
    switch (error.code) {
      case marketDataErrorCodeV3.unsupportedDataContractVersion:
      case marketDataErrorCodeV3.unsupportedPriceBasis:
        return new DsaV3ProtocolError(error.message, 'unsupported-capability', status);
      case marketDataErrorCodeV3.insufficientCoverage:
        return new DsaV3ProtocolError(error.message, 'insufficient-coverage', status);
      case marketDataErrorCodeV3.upstreamFailure:
        return new DsaV3ProtocolError(error.message, 'unavailable', status);
      case marketDataErrorCodeV3.invalidResponse:
        return new DsaV3ProtocolError(error.message, 'invalid-response', status);
    }
  }

  const message = isRecord(detail) && typeof detail.message === 'string' ? detail.message : '';
  const legacyCode = isRecord(detail) ? detail.code : undefined;
  if (legacyCode === 'unauthorized' || status === 401 || status === 403) {
    return new DsaV3ProtocolError(message || 'DSA Data Token 无效', 'unauthorized', status);
  }
  if (legacyCode === 'unsupported_capability' || status === 404 || status === 405) {
    return new DsaV3ProtocolError(
      message || 'DSA 不支持 Data Contract V3',
      'unsupported-capability',
      status,
    );
  }
  return new DsaV3ProtocolError(message || 'DSA Data V3 暂时不可用', 'unavailable', status);
};
