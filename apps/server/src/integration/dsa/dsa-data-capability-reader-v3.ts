import {
  marketChartBarsRequestV3Schema,
  marketEventRequestV3Schema,
  marketKnownCashRequestV3Schema,
  marketKnownCashEndpointV3,
  type MarketKnownCashRequestV3,
  marketKnownCashControlRequestV3Schema,
  marketKnownCashControlEndpointV3,
  type MarketKnownCashControlRequestV3,
  marketPublicFeesRequestV3Schema,
  marketPublicFeesResponseV3Schema,
  marketPublicFeesEndpointV3,
  marketTradingStatusRequestV3Schema,
  marketTradingStatusEndpointV3,
  type MarketChartBarsRequestV3,
  type MarketEventRequestV3,
  type MarketPublicFeesRequestV3,
  type MarketTradingStatusRequestV3,
  type MarketDataBarSeriesRequestV3,
  type MarketDataContractCapabilitiesV3,
  statusCapabilityRequestV1Schema, correlateStatusCapabilityV1, type StatusCapabilityRequestV1,
  marketCacheContextRequestV3Schema, correlateMarketCacheContextV3, type MarketCacheContextRequestV3,
} from '@thesis-ledger/schemas';
import { mapEventV3HttpError, parseEventResponseV3 } from './dsa-events-v3.js';
import { mapKnownCashV3HttpError, parseKnownCashResponseV3 } from './dsa-known-cash-v3.js';
import {
  mapKnownCashControlV3HttpError,
  parseKnownCashControlResponseV3,
} from './dsa-known-cash-control-v3.js';
import {
  DsaV3ProtocolError,
  mapDataV3HttpError,
  parseChartBarsResponseV3,
} from './dsa-v3-protocol.js';
import { readBarSeriesV3 } from './dsa-market-bars-v3.js';
import { parseTradingStatusResponseV3 } from './dsa-trading-status-v3.js';
import { readStatusRouteV1, type RoutedStatusRequestV1, type StatusPolicyReadV1 } from './dsa-status-route-reader-v1.js';

type Mapper = (status: number, payload: unknown) => DsaV3ProtocolError;
type Post = (path: string, request: unknown, mapper: Mapper) => Promise<unknown>;

/** 单次能力请求的绑定与响应解析；认证、期限与传输仍由 DsaClient 承接。 */
export class DsaDataCapabilityReaderV3 {
  constructor(
    private readonly post: Post,
    private readonly parse: <T>(read: () => T) => T,
    private readonly capabilities?: () => Promise<MarketDataContractCapabilitiesV3>,
    private readonly statusPolicy?: StatusPolicyReadV1,
  ) {}

  bars(input: MarketDataBarSeriesRequestV3) {
    if (!this.capabilities) throw new Error('DSA 行情能力读取器未注入');
    return readBarSeriesV3(
      input,
      (request) =>
        this.post('/api/v3/thesis-ledger/market/bars', request, (status, payload) =>
          mapDataV3HttpError(status, payload, request.requestId),
        ),
      this.capabilities,
    ).then(this.parse);
  }

  chartBars(input: MarketChartBarsRequestV3) {
    const request = marketChartBarsRequestV3Schema.parse(input);
    return this.post('/api/v3/thesis-ledger/market/chart-bars', request, (status, payload) =>
      mapDataV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => parseChartBarsResponseV3(raw, request)));
  }

  events(input: MarketEventRequestV3) {
    const request = marketEventRequestV3Schema.parse(input);
    return this.post('/api/v3/thesis-ledger/market/events', request, (status, payload) =>
      mapEventV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => parseEventResponseV3(raw, request)));
  }

  cacheContext(input: MarketCacheContextRequestV3) {
    const request = marketCacheContextRequestV3Schema.parse(input);
    return this.post('/api/v3/thesis-ledger/market/cache-context', request, (status, payload) =>
      mapDataV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => {
      try { return correlateMarketCacheContextV3(request, raw); }
      catch { throw new DsaV3ProtocolError('DSA 缓存控制响应未通过关联合同', 'invalid-response'); }
    }));
  }

  knownCash(input: MarketKnownCashRequestV3) {
    const request = marketKnownCashRequestV3Schema.parse(input);
    return this.post(marketKnownCashEndpointV3, request, (status, payload) =>
      mapKnownCashV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => parseKnownCashResponseV3(raw, request)));
  }

  knownCashControl(input: MarketKnownCashControlRequestV3) {
    const request = marketKnownCashControlRequestV3Schema.parse(input);
    return this.post(marketKnownCashControlEndpointV3, request, (status, payload) =>
      mapKnownCashControlV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => parseKnownCashControlResponseV3(raw, request)));
  }

  tradingStatus(input: MarketTradingStatusRequestV3) {
    const request = marketTradingStatusRequestV3Schema.parse(input);
    return this.post(marketTradingStatusEndpointV3, request, (status, payload) =>
      mapDataV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => parseTradingStatusResponseV3(raw, request)));
  }

  statusCapability(input: StatusCapabilityRequestV1) {
    const request = statusCapabilityRequestV1Schema.parse(input);
    return this.post('/api/v3/thesis-ledger/market/status-capabilities', request, (status, payload) =>
      mapDataV3HttpError(status, payload, request.requestId),
    ).then((raw) => this.parse(() => {
      try { return correlateStatusCapabilityV1(request, raw); }
      catch { throw new DsaV3ProtocolError('DSA 独立状态响应未通过关联合同', 'invalid-response'); }
    }));
  }

  routedStatusCapability(input: RoutedStatusRequestV1) {
    if (!this.statusPolicy) throw new DsaV3ProtocolError('DSA 功能政策读取器未注入', 'control-rejected');
    return readStatusRouteV1(input, this.statusPolicy, (request) => this.statusCapability(request));
  }

  publicFees(input: MarketPublicFeesRequestV3) {
    const request = marketPublicFeesRequestV3Schema.parse(input);
    return this.post(marketPublicFeesEndpointV3, request, (status, payload) =>
      mapDataV3HttpError(status, payload, request.requestId),
    ).then((raw) =>
      this.parse(() => {
        const parsed = marketPublicFeesResponseV3Schema.safeParse(raw);
        if (!parsed.success)
          throw new DsaV3ProtocolError('DSA 公共收费响应无效', 'invalid-response');
        const response = parsed.data;
        const bound = marketPublicFeesRequestV3Schema.parse({
          contractVersion: response.contractVersion,
          consumer: response.consumer,
          requestId: response.requestId,
          routeKey: response.routeKey,
          routeTarget: response.routeTarget,
          symbol: response.symbol,
          range: response.range,
        });
        if (
          JSON.stringify(bound) !== JSON.stringify(request) ||
          response.provenance.providerId !== request.routeTarget.providerId ||
          response.provenance.upstreamSource !== request.routeTarget.upstreamSource
        ) {
          throw new DsaV3ProtocolError('DSA 公共收费响应与固定请求不一致', 'invalid-response');
        }
        return response;
      }),
    );
  }
}
