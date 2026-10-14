import { BadRequestException, Controller, Get, Optional, Param, Query } from '@nestjs/common';
import {
  marketChartOptionsWindowV3Schema,
  quoteAssetTypeSchema,
  marketChartPlanV3Schema,
  indicatorCalculateResponseSchema,
  marketDetailResponseSchema,
  type BarSeries,
  type MarketDetailCapability,
  type MarketDetailDiagnostic,
  type MarketDetailSection,
} from '@thesis-ledger/schemas';
import { DSA_MARKET_INDICATOR_ENGINE_VERSION, DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService } from '../platform/redis.service.js';
import { MarketIndicatorCache, indicatorRequestKey } from './market-indicator-cache.js';
export { MarketIndicatorCache } from './market-indicator-cache.js';
import { MarketBarReader } from './market-bar-reader.js';
import {
  MARKET_DETAIL_CAPABILITIES,
  MARKET_DETAIL_CAPABILITY_MATRIX,
  MarketDetailService,
} from './market-detail.service.js';
import { normalizeIndicatorName, selectIndicatorParameters } from './market-indicator-request.js';
import { marketChartRequest, parseAcceptance } from './market-chart-request.js';
import { parseMarketTimeframe, requireNativeMarketTimeframe } from './market-period-request.js';
import { MarketPeriodDisplayService } from './market-period-display.service.js';
import { MarketPeriodDetailService } from './market-period-detail.service.js';
import { MarketPeriodOptionsService } from './market-period-options.service.js';
import { MarketService } from './market.service.js';
import { type QuoteAssetType } from './market-quote-reader.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import { planMarketChartWindow } from './market-chart-window.js';
import { indicatorReadInput, indicatorWindows, projectIndicatorResponse, MAX_CHART_V3_INDICATOR_INPUT_POINTS } from './market-indicator-window.js';

type IndicatorName = 'MA' | 'MACD' | 'RSI';

@Controller('api/market')
export class MarketController {
  private readonly indicatorCache: MarketIndicatorCache;
  constructor(
    private readonly reader: MarketBarReader,
    private readonly dsa: DsaClient,
    @Optional() redis?: RedisService,
    @Optional() private readonly detailService?: MarketDetailService,
    @Optional() private readonly market?: MarketService,
    @Optional() private readonly chartReader?: MarketChartReaderV3,
    @Optional() private readonly periods?: MarketPeriodDisplayService,
    @Optional() private readonly periodDetail?: MarketPeriodDetailService,
    @Optional() private readonly periodOptions?: MarketPeriodOptionsService,
  ) { this.indicatorCache = new MarketIndicatorCache(redis); }

  private async calculate(series: BarSeries, requests: Array<{ name: IndicatorName; parameters: Record<string, number> }>) {
    const normalizedRequests = requests.map((request) => ({
      name: request.name,
      parameters: Object.fromEntries(Object.entries(request.parameters).sort(([left], [right]) => left.localeCompare(right))),
    }));
    const key = `${series.inputFingerprint}:${DSA_MARKET_INDICATOR_ENGINE_VERSION}:${JSON.stringify(normalizedRequests)}`;
    const cached = await this.indicatorCache.get(key);
    if (cached) return cached;
    const response = indicatorCalculateResponseSchema.parse(await this.dsa.calculateIndicators({
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
    const displayTimeframe = parseMarketTimeframe(timeframe);
    if (this.periods && displayTimeframe !== '1m' && displayTimeframe !== '1d')
      return this.periods.bars(symbol, displayTimeframe,
        { assetType, adjustment, start, end, limit, acceptance, refresh, asOf });
    const input = marketChartRequest(symbol, { assetType, timeframe, adjustment, start, end, limit, acceptance, refresh, asOf });
    if (input.acceptance !== 'interactive' || input.asOf) {
      throw new BadRequestException('图表只支持 interactive 验收，不接受 asOf');
    }
    return this.reader.readChartV3(input);
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
    @Query('refresh') refresh?: string,
    @Query('asOf') asOf?: string,
  ) {
    const normalizedName = normalizeIndicatorName(name);
    const requests = [{ name: normalizedName, parameters: selectIndicatorParameters(normalizedName, parameters) }];
    const displayTimeframe = parseMarketTimeframe(timeframe);
    if (this.periods && displayTimeframe !== '1m' && displayTimeframe !== '1d')
      return this.periods.indicator(symbol, displayTimeframe,
        { assetType, adjustment, start, end, limit, acceptance, refresh, asOf }, requests);
    const input = marketChartRequest(symbol, { assetType, timeframe, adjustment, start, end, limit, acceptance, refresh, asOf });
    if (input.acceptance !== 'interactive' || input.asOf) throw new BadRequestException('图表只支持 interactive 验收，不接受 asOf');
    const acquired = await this.reader.readChartV3(indicatorReadInput(input, requests, MAX_CHART_V3_INDICATOR_INPUT_POINTS));
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
    @Query('chartContractVersion') chartContractVersion?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    if (chartContractVersion !== undefined && chartContractVersion !== '3') {
      throw new BadRequestException('chartContractVersion 仅支持 3');
    }
    if (!this.detailService) throw new Error('MarketDetailService 未注入');
    const identity = await this.detailService.resolveIdentity(symbol);
    const displayTimeframe = parseMarketTimeframe(timeframe);
    if (!this.periodDetail) requireNativeMarketTimeframe(timeframe, identity.assetType);
    const supported = MARKET_DETAIL_CAPABILITY_MATRIX[identity.assetType];
    const requested = this.parseDetailInclude(include) ?? [...supported];
    const parsedBarsLimit = this.parseDetailLimit(barsLimit ?? (displayTimeframe === '1y' ? '10' : undefined), 'barsLimit', 3000);
    const parsedNavLimit = this.parseDetailLimit(navLimit, 'navLimit');
    if (this.periodDetail && displayTimeframe !== '1m' && displayTimeframe !== '1d') {
      return this.periodDetail.get(identity, displayTimeframe, {
        requested, barsLimit: parsedBarsLimit, navLimit: parsedNavLimit,
        adjustment, start, end, acceptance, indicatorParams, refresh,
      });
    }
    const nativeTimeframe = requireNativeMarketTimeframe(timeframe, identity.assetType);
    const requestId = crypto.randomUUID();
    const sections: Partial<Record<MarketDetailCapability, MarketDetailSection>> = {};
    const dependencies: Record<string, { status: 'ready' | 'stale' | 'empty' | 'unsupported' | 'unavailable'; error?: MarketDetailDiagnostic }> = {};
    let barSeries: BarSeries | undefined;
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
      if (parseAcceptance(acceptance) !== 'interactive') {
        throw new BadRequestException('图表只支持 interactive 验收');
      }
      const indicatorCapabilities = barCapabilities.filter((capability) => capability.startsWith('indicator:'));
      // 参数错误属于 400，不得被吞成行情服务故障。
      const requests = indicatorCapabilities.map((capability) => {
        const name = normalizeIndicatorName(capability.slice('indicator:'.length));
        return { name, parameters: selectIndicatorParameters(name, indicatorParams) };
      });
      const input = marketChartRequest(identity.symbol, {
        assetType: identity.assetType, timeframe: nativeTimeframe, adjustment: adjustment ?? 'qfq',
        start, end, limit: String(parsedBarsLimit), acceptance, refresh,
      });
      const readInput = requests.length ? indicatorReadInput(input, requests,
        MAX_CHART_V3_INDICATOR_INPUT_POINTS) : input;
      let calculationSeries: BarSeries | undefined;
      let barStatus: 'ready' | 'stale' | 'empty' = 'ready';
      try {
        const acquired = await this.reader.readChartV3(readInput);
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
    return marketDetailResponseSchema.parse({
      contractVersion: 3, symbol: identity.symbol, assetType: identity.assetType,
      identity: { source: identity.source, status: identity.status }, requested,
      capabilities: { supported: [...supported], unsupported: MARKET_DETAIL_CAPABILITIES.filter((capability) => !supported.includes(capability)) },
      limits: { bars: parsedBarsLimit, nav: parsedNavLimit, barsHasMoreBefore: barSeries?.coverage.hasMoreBefore ?? false },
      ...(barSeries ? { barSeries } : {}), sections, dependencies, requestId, generatedAt: new Date().toISOString(),
    });
  }

  @Get(':symbol/period-options') async derivedOptions(@Param('symbol') symbol: string,
    @Query('adjustment') adjustment?: string, @Query('start') start?: string,
    @Query('end') end?: string, @Query('barsLimit') barsLimit?: string,
    @Query('indicatorParams') indicatorParams?: string) {
    if (!this.detailService || !this.periodOptions) throw new Error('周期能力服务未注入');
    const limit = barsLimit === undefined ? undefined : String(this.parseDetailLimit(barsLimit, 'barsLimit', 3000));
    return this.periodOptions.get(await this.detailService.resolveIdentity(symbol),
      { adjustment, start, end, limit }, indicatorParams);
  }

  @Get(':symbol/chart-options') async chartOptions(@Param('symbol') symbol: string,
    @Query('start') start?: string, @Query('end') end?: string,
    @Query('barsLimit') barsLimit?: string, @Query('indicatorParams') indicatorParams?: string,
    @Query('planEnd') planEnd?: string) {
    if (!this.detailService || !this.chartReader) throw new Error('图表能力服务未注入');
    if (barsLimit !== undefined || indicatorParams !== undefined || planEnd !== undefined) {
      if (start !== undefined || end !== undefined) throw new BadRequestException('图表规划与显式窗口不能同时传入');
      let plan;
      try { plan = marketChartPlanV3Schema.parse({ barsLimit: Number(barsLimit ?? 90),
        indicatorParams: indicatorParams === undefined ? {} : JSON.parse(indicatorParams) as unknown,
        ...(planEnd !== undefined ? { end: planEnd } : {}) }); }
      catch { throw new BadRequestException('图表窗口规划参数无效'); }
      const identity = await this.detailService.resolveIdentity(symbol);
      const input = marketChartRequest(identity.symbol, { assetType: identity.assetType, timeframe: '1d',
        adjustment: 'qfq', limit: String(plan.barsLimit), acceptance: 'interactive',
        ...(plan.end ? { end: planMarketChartWindow({ end: plan.end }).end } : {}) });
      const requests = (['MA', 'MACD', 'RSI'] as const).map((name) => ({ name,
        parameters: selectIndicatorParameters(name, JSON.stringify(plan.indicatorParams)) }));
      const planned = planMarketChartWindow(indicatorReadInput(input, requests, MAX_CHART_V3_INDICATOR_INPUT_POINTS).window);
      return { ...await this.chartReader.options(identity, planned), plan };
    }
    const window = start !== undefined || end !== undefined
      ? marketChartOptionsWindowV3Schema.safeParse({ start, end }) : undefined;
    if (window && !window.success) throw new BadRequestException('图表能力窗口必须提供有效且有序的 start/end');
    return this.chartReader.options(await this.detailService.resolveIdentity(symbol), window?.data);
  }

  @Get(':symbol/quote') quote(@Param('symbol') symbol: string, @Query('assetType') assetType?: QuoteAssetType) {
    if (!this.market) throw new Error('MarketService 未注入');
    if (assetType !== undefined && !quoteAssetTypeSchema.safeParse(assetType).success)
      throw new BadRequestException('报价 assetType 必须为 STOCK、ETF 或 INDEX');
    return this.market.getQuote(symbol, assetType ? { assetType } : {});
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

  private parseDetailLimit(value: string | undefined, field: 'barsLimit' | 'navLimit', maximum = 90) {
    if (value === undefined) return 30;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
      throw new BadRequestException(`${field} 必须是 1 到 ${maximum} 之间的整数`);
    return parsed;
  }

  private detailDiagnostic(requestId: string, capability: MarketDetailCapability, code: string): MarketDetailDiagnostic {
    let message = '当前行情暂时不可用，请稍后重试。';
    if (code === 'capability_unsupported') message = '当前资产类型不支持该行情能力。';
    else if (code === 'daily_bar_unavailable') message = '技术指标依赖的日线数据暂时不可用。';
    else if (code === 'indicator_calculation_unavailable') message = '技术指标计算暂时不可用，日线行情仍可查看。';
    return { code, message, diagnosticId: `${requestId}:${capability}:${crypto.randomUUID()}`, requestId };
  }

  private detailFailure(capability: MarketDetailCapability, status: 'unsupported' | 'unavailable', requestId: string, code: string): MarketDetailSection {
    return { capability, status, error: this.detailDiagnostic(requestId, capability, code) };
  }
}
