import { BadRequestException, Controller, Get, Optional, Param, Query } from '@nestjs/common';
import {
  barSeriesIdentityV2Schema,
  indicatorCalculateResponseV2Schema,
  marketDetailResponseV2Schema,
  type BarSeriesIdentityV2,
  type BarSeriesV2,
  type MarketDetailCapability,
  type MarketDetailDiagnostic,
  type MarketDetailSectionV2,
} from '@thesis-ledger/schemas';
import { DSA_MARKET_INDICATOR_ENGINE_VERSION, DsaClient } from '../integration/dsa/dsa.client.js';
import { inferAssetType } from '../ledger/asset-type.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { MarketBarReader, type BarReadAcceptance } from './market-bar-reader.js';
import {
  MARKET_DETAIL_CAPABILITIES,
  MARKET_DETAIL_CAPABILITY_MATRIX,
  MarketDetailService,
} from './market-detail.service.js';
import { assertCalendarDateRange, assertIndicatorParameters } from './market-request-validation.js';
import { MarketService } from './market.service.js';
import { indicatorReadInput, indicatorWindows, projectIndicatorResponse } from './market-indicator-window.js';

type IndicatorName = 'MA' | 'MACD' | 'RSI';
const indicatorKeys: Record<IndicatorName, readonly string[]> = {
  MA: ['period'],
  MACD: ['fast', 'slow', 'signal', 'macdFast', 'macdSlow', 'macdSignal'],
  RSI: ['short', 'mid', 'long', 'rsiShort', 'rsiMid', 'rsiLong'],
};

type IndicatorResponse = ReturnType<typeof indicatorCalculateResponseV2Schema.parse>;
type CachedIndicator = { expiresAt: number; response: IndicatorResponse };

const indicatorRequestKey = (request: { name: string; parameters: Record<string, number> }) =>
  `${request.name}:${JSON.stringify(Object.entries(request.parameters).sort(([left], [right]) => left.localeCompare(right)))}`;

export class MarketIndicatorCache {
  private readonly memory = new Map<string, CachedIndicator>();
  constructor(private readonly redis?: RedisService) {}

  async get(key: string): Promise<IndicatorResponse | null> {
    const local = this.memory.get(key);
    if (local) {
      if (local.expiresAt > Date.now()) return local.response;
      this.memory.delete(key);
    }
    const client = this.redis?.client;
    if (!client?.get) return null;
    try {
      const raw = await client.get(redisKey('cache', `market-indicators-v2:${key}`));
      return raw ? indicatorCalculateResponseV2Schema.parse(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  async set(key: string, response: IndicatorResponse, expiresAt: number) {
    if (expiresAt <= Date.now()) return;
    this.memory.set(key, { response, expiresAt });
    const client = this.redis?.client;
    if (!client?.set) return;
    try {
      const ttl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      await client.set(redisKey('cache', `market-indicators-v2:${key}`), JSON.stringify(response), 'EX', ttl);
    } catch { /* Redis 写失败不影响已完成的纯计算结果。 */ }
  }
}

const parseAcceptance = (value: string | undefined): BarReadAcceptance => {
  if (!value) return 'interactive';
  if (value === 'interactive' || value === 'complete' || value === 'point-in-time') return value;
  throw new BadRequestException('acceptance 必须是 interactive、complete 或 point-in-time');
};

const parseParameters = (value: string | undefined): Record<string, number> => {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object');
    if (!Object.values(parsed).every((item) => typeof item === 'number' && Number.isFinite(item)))
      throw new Error('number');
    return parsed as Record<string, number>;
  } catch { throw new BadRequestException('parameters 必须是 JSON 数字对象'); }
};

const normalizeIndicatorName = (value: string): IndicatorName => {
  const normalized = value.toUpperCase();
  if (normalized !== 'MA' && normalized !== 'MACD' && normalized !== 'RSI')
    throw new BadRequestException('指标名称不支持');
  return normalized;
};

const selectIndicatorParameters = (name: IndicatorName, value: string | undefined) => {
  const parsed = parseParameters(value);
  const selected = Object.fromEntries(Object.entries(parsed).filter(([key]) => indicatorKeys[name].includes(key)));
  try { assertIndicatorParameters(name, selected); }
  catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '指标参数无效'); }
  if (name === 'MA') return { period: selected.period ?? 5 };
  if (name === 'MACD') return {
    fast: selected.fast ?? selected.macdFast ?? 12,
    slow: selected.slow ?? selected.macdSlow ?? 26,
    signal: selected.signal ?? selected.macdSignal ?? 9,
  };
  return {
    short: selected.short ?? selected.rsiShort ?? 6,
    mid: selected.mid ?? selected.rsiMid ?? 12,
    long: selected.long ?? selected.rsiLong ?? 24,
  };
};

@Controller('api/v2/market')
export class MarketV2Controller {
  private readonly indicatorCache: MarketIndicatorCache;
  constructor(
    private readonly reader: MarketBarReader,
    private readonly dsa: DsaClient,
    @Optional() redis?: RedisService,
    @Optional() private readonly detailService?: MarketDetailService,
    @Optional() private readonly market?: MarketService,
  ) { this.indicatorCache = new MarketIndicatorCache(redis); }

  private input(symbol: string, query: Record<string, string | undefined>) {
    let identity: BarSeriesIdentityV2;
    try {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const requestedAssetType = query.assetType?.trim().toLowerCase();
      const resolvedAssetType = requestedAssetType ?? inferAssetType(normalizedSymbol);
      const assetType = resolvedAssetType === 'fund' ? 'MUTUAL_FUND' : resolvedAssetType?.toUpperCase();
      identity = barSeriesIdentityV2Schema.parse({
        symbol: normalizedSymbol, assetType,
        timeframe: query.timeframe ?? '1d', adjustment: query.adjustment ?? 'qfq',
      });
    } catch { throw new BadRequestException('assetType、timeframe 或 adjustment 不支持'); }
    const limit = query.limit === undefined ? undefined : Number(query.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 3650))
      throw new BadRequestException('limit 必须是 1 到 3650 之间的整数');
    try { assertCalendarDateRange(query.start, query.end); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '日期范围无效'); }
    if (query.asOf && Number.isNaN(new Date(query.asOf).getTime())) throw new BadRequestException('asOf 必须是有效时间');
    return {
      identity,
      window: {
        ...(query.start ? { start: query.start } : {}),
        ...(query.end ? { end: query.end } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
      acceptance: parseAcceptance(query.acceptance),
      refresh: query.refresh === '1',
      ...(query.asOf ? { asOf: query.asOf } : {}),
    } as const;
  }

  private async calculate(series: BarSeriesV2, requests: Array<{ name: IndicatorName; parameters: Record<string, number> }>) {
    const normalizedRequests = requests.map((request) => ({
      name: request.name,
      parameters: Object.fromEntries(Object.entries(request.parameters).sort(([left], [right]) => left.localeCompare(right))),
    }));
    const key = `${series.inputFingerprint}:${DSA_MARKET_INDICATOR_ENGINE_VERSION}:${JSON.stringify(normalizedRequests)}`;
    const cached = await this.indicatorCache.get(key);
    if (cached) return cached;
    const response = indicatorCalculateResponseV2Schema.parse(await this.dsa.calculateIndicatorsV2({
      identity: series.identity, inputFingerprint: series.inputFingerprint,
      points: series.points, requests: normalizedRequests,
    }));
    if (response.results.some((result) => result.inputFingerprint !== response.inputFingerprint) || response.inputFingerprint !== series.inputFingerprint)
      throw new Error('指标结果 fingerprint 与 BarSeries 不一致');
    const expectedKeys = normalizedRequests.map(indicatorRequestKey).sort();
    const actualKeys = response.results.map(indicatorRequestKey).sort();
    if (expectedKeys.length !== actualKeys.length || expectedKeys.some((keyValue, index) => keyValue !== actualKeys[index]))
      throw new Error('DSA 指标结果与请求集合不一致');
    if (response.engineVersion !== DSA_MARKET_INDICATOR_ENGINE_VERSION) throw new Error('DSA 指标 engineVersion 不受支持');
    await this.indicatorCache.set(key, response, new Date(series.provenance.freshUntil).getTime());
    return response;
  }

  @Get(':symbol/bars') bars(
    @Param('symbol') symbol: string,
    @Query('assetType') assetType?: string,
    @Query('timeframe') timeframe?: string,
    @Query('adjustment') adjustment?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
    @Query('acceptance') acceptance?: string,
    @Query('refresh') refresh?: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.reader.read(this.input(symbol, { assetType, timeframe, adjustment, start, end, limit, acceptance, refresh, asOf }));
  }

  @Get(':symbol/indicators/:name') async indicator(
    @Param('symbol') symbol: string,
    @Param('name') name: string,
    @Query('assetType') assetType?: string,
    @Query('timeframe') timeframe?: string,
    @Query('adjustment') adjustment?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
    @Query('acceptance') acceptance?: string,
    @Query('parameters') parameters?: string,
  ) {
    const normalizedName = normalizeIndicatorName(name);
    const requests = [{ name: normalizedName, parameters: selectIndicatorParameters(normalizedName, parameters) }];
    const input = this.input(symbol, { assetType, timeframe, adjustment, start, end, limit, acceptance });
    const acquired = await this.reader.read(indicatorReadInput(input, requests));
    const { visible, calculation } = indicatorWindows(acquired, input, requests);
    return projectIndicatorResponse(await this.calculate(calculation, requests), calculation, visible);
  }

  @Get(':symbol/detail') async detail(
    @Param('symbol') symbol: string,
    @Query('include') include?: string | string[],
    @Query('barsLimit') barsLimit?: string,
    @Query('navLimit') navLimit?: string,
    @Query('adjustment') adjustment?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('acceptance') acceptance?: string,
    @Query('indicatorParams') indicatorParams?: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!this.detailService) throw new Error('MarketDetailService 未注入');
    const identity = await this.detailService.resolveIdentity(symbol);
    const supported = MARKET_DETAIL_CAPABILITY_MATRIX[identity.assetType];
    const requested = this.parseDetailInclude(include) ?? [...supported];
    const parsedBarsLimit = this.parseDetailLimit(barsLimit, 'barsLimit');
    const parsedNavLimit = this.parseDetailLimit(navLimit, 'navLimit');
    const requestId = crypto.randomUUID();
    const sections: Partial<Record<MarketDetailCapability, MarketDetailSectionV2>> = {};
    const dependencies: Record<string, { status: 'ready' | 'stale' | 'empty' | 'unsupported' | 'unavailable'; error?: MarketDetailDiagnostic }> = {};
    let barSeries: BarSeriesV2 | undefined;
    const nonBarRequested = requested.filter((capability) => capability !== 'bars' && !capability.startsWith('indicator:'));
    if (nonBarRequested.length > 0) {
      const legacy = await this.detailService.getDetail(identity.symbol, {
        include: nonBarRequested, navLimit: parsedNavLimit,
        ...(start ? { start } : {}), ...(end ? { end } : {}), refresh: refresh === '1',
      });
      Object.assign(sections, legacy.sections);
      Object.assign(dependencies, legacy.dependencies);
    }
    for (const capability of requested) {
      if (!supported.includes(capability))
        sections[capability] = this.detailFailure(capability, 'unsupported', requestId, 'capability_unsupported');
    }
    const barCapabilities = requested.filter((capability) => supported.includes(capability) &&
      (capability === 'bars' || capability.startsWith('indicator:')));
    if (barCapabilities.length > 0) {
      const indicatorCapabilities = barCapabilities.filter((capability) => capability.startsWith('indicator:'));
      // 参数错误属于 400，不得被吞成行情服务故障。
      const requests = indicatorCapabilities.map((capability) => {
        const name = normalizeIndicatorName(capability.slice('indicator:'.length));
        return { name, parameters: selectIndicatorParameters(name, indicatorParams) };
      });
      const input = this.input(identity.symbol, {
        assetType: identity.assetType, timeframe: '1d', adjustment: adjustment ?? 'qfq',
        start, end, limit: String(parsedBarsLimit), acceptance, refresh,
      });
      const readInput = requests.length ? indicatorReadInput(input, requests) : input;
      let calculationSeries: BarSeriesV2 | undefined;
      let barStatus: 'ready' | 'stale' | 'empty' = 'ready';
      try {
        const acquired = await this.reader.read(readInput);
        if (requests.length) {
          const windows = indicatorWindows(acquired, input, requests);
          barSeries = windows.visible;
          calculationSeries = windows.calculation;
        } else { barSeries = acquired; }
        barStatus = barSeries.points.length === 0 ? 'empty'
          : barSeries.provenance.cacheStatus === 'stale' ? 'stale' : 'ready';
        if (requested.includes('bars')) sections.bars = { capability: 'bars', status: barStatus, data: barSeries };
        dependencies.DAILY_BAR = { status: barStatus };
      } catch {
        dependencies.DAILY_BAR = { status: 'unavailable', error: this.detailDiagnostic(requestId, 'bars', 'market_data_unavailable') };
        for (const capability of barCapabilities) sections[capability] = this.detailFailure(capability, 'unavailable', requestId,
          capability === 'bars' ? 'market_data_unavailable' : 'daily_bar_unavailable');
      }
      if (barSeries && calculationSeries && requests.length) {
        if (barSeries.points.length === 0) {
          for (const capability of indicatorCapabilities) sections[capability] = { capability, status: 'empty', data: null };
        } else {
          // 日线读取与指标计算独立降级：计算失败不覆盖 bars 或 DAILY_BAR 的成功状态。
          try {
            const response = await this.calculate(calculationSeries, requests);
            const projected = projectIndicatorResponse(response, calculationSeries, barSeries);
            for (const result of projected.results) {
              const capability: MarketDetailCapability = `indicator:${result.name}`;
              sections[capability] = { capability, status: barStatus, data: result };
            }
          } catch {
            for (const capability of indicatorCapabilities) sections[capability] = this.detailFailure(
              capability, 'unavailable', requestId, 'indicator_calculation_unavailable');
          }
        }
      }
    }
    return marketDetailResponseV2Schema.parse({
      contractVersion: 2, symbol: identity.symbol, assetType: identity.assetType,
      identity: { source: identity.source, status: identity.status }, requested,
      capabilities: { supported: [...supported], unsupported: MARKET_DETAIL_CAPABILITIES.filter((capability) => !supported.includes(capability)) },
      limits: { bars: parsedBarsLimit, nav: parsedNavLimit, barsHasMoreBefore: barSeries?.coverage.hasMoreBefore ?? false },
      ...(barSeries ? { barSeries } : {}), sections, dependencies, requestId, generatedAt: new Date().toISOString(),
    });
  }

  @Get(':symbol/quote') quote(@Param('symbol') symbol: string) {
    if (!this.market) throw new Error('MarketService 未注入');
    return this.market.getQuote(symbol);
  }

  @Get(':symbol/fund-nav') fundNav(@Param('symbol') symbol: string) {
    if (!this.market) throw new Error('MarketService 未注入');
    return this.market.getFundNav(symbol);
  }

  @Get(':symbol/fund-nav/history') fundNavHistory(
    @Param('symbol') symbol: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('limit') limit?: string,
  ) {
    if (!this.market) throw new Error('MarketService 未注入');
    return this.market.getFundNavHistory(symbol, {
      ...(start ? { start } : {}), ...(end ? { end } : {}), ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  @Get(':symbol/chip') chip(@Param('symbol') symbol: string) {
    if (!this.market) throw new Error('MarketService 未注入');
    return this.market.getChip(symbol);
  }

  private parseDetailInclude(value: string | string[] | undefined): MarketDetailCapability[] | undefined {
    if (value === undefined) return undefined;
    const values = (Array.isArray(value) ? value : [value]).flatMap((item) => item.split(','))
      .map((item) => item.trim()).filter(Boolean);
    const unique = [...new Set(values)];
    if (unique.length === 0 || unique.some((item) => !(MARKET_DETAIL_CAPABILITIES as readonly string[]).includes(item)))
      throw new BadRequestException('include 包含不支持的行情详情能力');
    return unique as MarketDetailCapability[];
  }

  private parseDetailLimit(value: string | undefined, field: 'barsLimit' | 'navLimit') {
    if (value === undefined) return 30;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90)
      throw new BadRequestException(`${field} 必须是 1 到 90 之间的整数`);
    return parsed;
  }

  private detailDiagnostic(requestId: string, capability: MarketDetailCapability, code: string): MarketDetailDiagnostic {
    let message = '当前行情暂时不可用，请稍后重试。';
    if (code === 'capability_unsupported') message = '当前资产类型不支持该行情能力。';
    else if (code === 'daily_bar_unavailable') message = '技术指标依赖的日线数据暂时不可用。';
    else if (code === 'indicator_calculation_unavailable') message = '技术指标计算暂时不可用，日线行情仍可查看。';
    return { code, message, diagnosticId: `${requestId}:${capability}:${crypto.randomUUID()}`, requestId };
  }

  private detailFailure(capability: MarketDetailCapability, status: 'unsupported' | 'unavailable', requestId: string, code: string): MarketDetailSectionV2 {
    return { capability, status, error: this.detailDiagnostic(requestId, capability, code) };
  }
}
