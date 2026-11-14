import { hasNativeChartRoute } from './market-native-chart-route.js';
import { marketCalculationAnchor } from '@thesis-ledger/schemas';
import { BadRequestException, Controller, Get, Optional, Param, Query } from '@nestjs/common';
import {
  quoteAssetTypeSchema,
  marketDetailResponseSchema,
  type BarSeries,
  type MarketDetailCapability,
  type MarketDetailDiagnostic,
  type MarketDetailSection,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService } from '../platform/redis.service.js';
import { MarketNativeIndicatorReader } from './market-native-indicator-reader.js';
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
import { MarketMinuteDisplayService } from './market-minute-display.service.js';
import { MarketMinuteOptionsService } from './market-minute-options.service.js';
import { marketMinutePeriodSchema, marketDerivedTimeframeSchema } from '@thesis-ledger/schemas';
import { MarketService } from './market.service.js';
import { type QuoteAssetType } from './market-quote-reader.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import { parseChartOptionsQuery, planChartOptionsRequest } from './market-chart-options-request.js';
import { indicatorReadInput, indicatorWindows, projectIndicatorResponse, MAX_CHART_V3_INDICATOR_INPUT_POINTS } from './market-indicator-window.js';

type DetailSections = Partial<Record<MarketDetailCapability, MarketDetailSection>>;
type DetailDependencies = Record<
  string,
  {
    status: 'ready' | 'stale' | 'empty' | 'unsupported' | 'unavailable';
    error?: MarketDetailDiagnostic;
  }
>;
type DetailBarsInput = {
  identity: Awaited<ReturnType<MarketDetailService['resolveIdentity']>>;
  nativeTimeframe: ReturnType<typeof requireNativeMarketTimeframe>;
  adjustment: string | undefined;
  start: string | undefined;
  chartEnd: string | undefined;
  parsedBarsLimit: number;
  acceptance: string | undefined;
  refresh: string | undefined;
  indicatorParams: string | undefined;
  anchor: ReturnType<typeof marketCalculationAnchor>;
  requested: MarketDetailCapability[];
  barCapabilities: MarketDetailCapability[];
  sections: DetailSections;
  dependencies: DetailDependencies;
  requestId: string;
};

@Controller('api/market')
export class MarketController {
  private readonly nativeIndicators: MarketNativeIndicatorReader;
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
    @Optional() private readonly minutes?: MarketMinuteDisplayService,
    @Optional() private readonly minuteOptions?: MarketMinuteOptionsService,
  ) { this.nativeIndicators = new MarketNativeIndicatorReader(dsa, redis); }

  @Get(':symbol/bars') async bars(
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
    const minute = marketMinutePeriodSchema.safeParse(displayTimeframe);
    if (minute.success && this.minutes && !await hasNativeChartRoute(this.chartReader, symbol, displayTimeframe, assetType))
      return this.minutes.bars(symbol, minute.data,
        { assetType, adjustment, start, end, limit, acceptance, refresh, asOf });
    if (this.periods && !minute.success && displayTimeframe !== '1m' && displayTimeframe !== '1d')
      return this.periods.bars(symbol, marketDerivedTimeframeSchema.parse(displayTimeframe),
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
    const minute = marketMinutePeriodSchema.safeParse(displayTimeframe);
    if (minute.success && this.minutes && !await hasNativeChartRoute(this.chartReader, symbol, displayTimeframe, assetType))
      return this.minutes.indicator(symbol, minute.data,
        { assetType, adjustment, start, end, limit, acceptance, refresh, asOf }, requests);
    if (this.periods && !minute.success && displayTimeframe !== '1m' && displayTimeframe !== '1d')
      return this.periods.indicator(symbol, marketDerivedTimeframeSchema.parse(displayTimeframe),
        { assetType, adjustment, start, end, limit, acceptance, refresh, asOf }, requests);
    const input = marketChartRequest(symbol, { assetType, timeframe, adjustment, start, end, limit, acceptance, refresh, asOf });
    if (input.acceptance !== 'interactive' || input.asOf) throw new BadRequestException('图表只支持 interactive 验收，不接受 asOf');
    const acquired = await this.reader.readChartV3(indicatorReadInput(input, requests, MAX_CHART_V3_INDICATOR_INPUT_POINTS));
    const { visible, calculation } = indicatorWindows(acquired, input, requests);
    return projectIndicatorResponse(await this.nativeIndicators.calculate(calculation, requests), calculation, visible);
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
    @Query('calculationAnchor') calculationAnchor?: string,
  ) {
    if (chartContractVersion !== undefined && chartContractVersion !== '3') {
      throw new BadRequestException('chartContractVersion 仅支持 3');
    }
    if (!this.detailService) throw new Error('MarketDetailService 未注入');
    const identity = await this.detailService.resolveIdentity(symbol);
    const displayTimeframe = parseMarketTimeframe(timeframe);
    const anchor = detailCalculationAnchor({ symbol: identity.symbol, timeframe: displayTimeframe, calculationAnchor, end });
    const chartEnd = anchor?.end ?? end;
    if (!this.periodDetail) requireNativeMarketTimeframe(timeframe, identity.assetType);
    const supported = MARKET_DETAIL_CAPABILITY_MATRIX[identity.assetType];
    const requested = this.parseDetailInclude(include) ?? [...supported];
    const { parsedBarsLimit, parsedNavLimit } = this.detailLimits(barsLimit, navLimit, displayTimeframe);
    if (this.periodDetail && displayTimeframe !== '1m' && displayTimeframe !== '1d' && !await hasNativeChartRoute(this.chartReader, identity.symbol, displayTimeframe, identity.assetType)) {
      return this.periodDetail.get(identity, displayTimeframe, {
        requested, barsLimit: parsedBarsLimit, navLimit: parsedNavLimit,
        adjustment, start, end: chartEnd, acceptance, indicatorParams, refresh, calculationAnchor: anchor?.timestamp,
      });
    }
    const nativeTimeframe = requireNativeMarketTimeframe(timeframe, identity.assetType);
    const requestId = crypto.randomUUID();
    const sections: Partial<Record<MarketDetailCapability, MarketDetailSection>> = {};
    const dependencies: Record<string, { status: 'ready' | 'stale' | 'empty' | 'unsupported' | 'unavailable'; error?: MarketDetailDiagnostic }> = {};
    let barSeries: BarSeries | undefined;
    const nonBarRequested = requested.filter((capability) => capability !== 'bars' && !capability.startsWith('indicator:'));
    if (nonBarRequested.length > 0) {
      const legacy = await this.detailService.getDetail(identity.symbol, legacyDetailQuery(nonBarRequested, parsedNavLimit, start, end, refresh));
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
      barSeries = await this.readDetailBars({ identity, nativeTimeframe, adjustment, start, chartEnd, parsedBarsLimit, acceptance, refresh, indicatorParams, anchor, requested, barCapabilities, sections, dependencies, requestId });
    }
    return marketDetailResponseSchema.parse({
      contractVersion: 3, symbol: identity.symbol, assetType: identity.assetType,
      identity: { source: identity.source, status: identity.status }, requested,
      capabilities: { supported: [...supported], unsupported: MARKET_DETAIL_CAPABILITIES.filter((capability) => !supported.includes(capability)) },
      limits: { bars: parsedBarsLimit, nav: parsedNavLimit, barsHasMoreBefore: barSeries?.coverage.hasMoreBefore ?? false },
      ...(barSeries ? { barSeries } : {}), sections, dependencies, requestId, generatedAt: new Date().toISOString(),
    });
  }

  private detailLimits(
    barsLimit: string | undefined,
    navLimit: string | undefined,
    displayTimeframe: ReturnType<typeof parseMarketTimeframe>,
  ) {
    const parsedBarsLimit = this.parseDetailLimit(
      barsLimit ?? (displayTimeframe === '1y' ? '10' : undefined),
      'barsLimit',
      3000,
    );
    const parsedNavLimit = this.parseDetailLimit(navLimit, 'navLimit');
    return { parsedBarsLimit, parsedNavLimit };
  }

  private async readDetailBars({
    identity,
    nativeTimeframe,
    adjustment,
    start,
    chartEnd,
    parsedBarsLimit,
    acceptance,
    refresh,
    indicatorParams,
    anchor,
    requested,
    barCapabilities,
    sections,
    dependencies,
    requestId,
  }: DetailBarsInput) {
    let barSeries: BarSeries | undefined;
    if (parseAcceptance(acceptance) !== 'interactive') {
      throw new BadRequestException('图表只支持 interactive 验收');
    }
    const indicatorCapabilities = barCapabilities.filter((capability) =>
      capability.startsWith('indicator:'),
    );
    // 参数错误属于 400，不得被吞成行情服务故障。
    const requests = indicatorCapabilities.map((capability) => {
      const name = normalizeIndicatorName(capability.slice('indicator:'.length));
      return { name, parameters: selectIndicatorParameters(name, indicatorParams) };
    });
    const nativeInput = marketChartRequest(identity.symbol, {
      assetType: identity.assetType,
      timeframe: nativeTimeframe,
      adjustment,
      start,
      end: chartEnd,
      limit: String(parsedBarsLimit),
      acceptance,
      refresh,
    });
    const input = anchor
      ? { ...nativeInput, window: { ...nativeInput.window, end: anchor.timestamp } }
      : nativeInput;
    const readInput = requests.length
      ? indicatorReadInput(input, requests, MAX_CHART_V3_INDICATOR_INPUT_POINTS)
      : input;
    let calculationSeries: BarSeries | undefined;
    let barStatus: 'ready' | 'stale' | 'empty' = 'ready';
    try {
      const acquired = await this.reader.readChartV3(readInput);
      if (requests.length) {
        const windows = indicatorWindows(acquired, input, requests);
        barSeries = windows.visible;
        calculationSeries = windows.calculation;
      } else {
        barSeries = acquired;
      }
      barStatus = chartBarStatus(barSeries.points.length, barSeries.provenance.cacheStatus);
      if (requested.includes('bars'))
        sections.bars = { capability: 'bars', status: barStatus, data: barSeries };
      dependencies.DAILY_BAR = { status: barStatus };
    } catch {
      dependencies.DAILY_BAR = {
        status: 'unavailable',
        error: this.detailDiagnostic(requestId, 'bars', 'market_data_unavailable'),
      };
      for (const capability of barCapabilities)
        sections[capability] = this.detailFailure(
          capability,
          'unavailable',
          requestId,
          capability === 'bars' ? 'market_data_unavailable' : 'daily_bar_unavailable',
        );
    }
    if (barSeries && calculationSeries && requests.length) {
      if (barSeries.points.length === 0) {
        for (const capability of indicatorCapabilities)
          sections[capability] = { capability, status: 'empty', data: null };
      } else {
        await this.calculateDetailIndicators(
          calculationSeries,
          barSeries,
          requests,
          indicatorCapabilities,
          barStatus,
          sections,
          requestId,
        );
      }
    }
    return barSeries;
  }

  private async calculateDetailIndicators(
    calculationSeries: BarSeries,
    barSeries: BarSeries,
    requests: Parameters<MarketNativeIndicatorReader['calculate']>[1],
    indicatorCapabilities: MarketDetailCapability[],
    barStatus: 'ready' | 'stale' | 'empty',
    sections: DetailSections,
    requestId: string,
  ) {
    // 日线读取与指标计算独立降级：计算失败不覆盖 bars 或 DAILY_BAR 的成功状态。
    try {
      const response = await this.nativeIndicators.calculate(calculationSeries, requests);
      const projected = projectIndicatorResponse(response, calculationSeries, barSeries);
      for (const result of projected.results) {
        const capability: MarketDetailCapability = `indicator:${result.name}`;
        sections[capability] = { capability, status: barStatus, data: result };
      }
    } catch {
      for (const capability of indicatorCapabilities)
        sections[capability] = this.detailFailure(
          capability,
          'unavailable',
          requestId,
          'indicator_calculation_unavailable',
        );
    }
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

  @Get(':symbol/minute-options') async derivedMinuteOptions(@Param('symbol') symbol: string,
    @Query('start') start?: string, @Query('end') end?: string,
    @Query('barsLimit') barsLimit?: string, @Query('indicatorParams') indicatorParams?: string) {
    if (!this.detailService || !this.minuteOptions) throw new Error('分钟周期能力服务未注入');
    const limit = barsLimit === undefined ? undefined : String(this.parseDetailLimit(barsLimit, 'barsLimit', 3000));
    return this.minuteOptions.get(await this.detailService.resolveIdentity(symbol), { start, end, limit }, indicatorParams);
  }

  @Get(':symbol/chart-options') async chartOptions(@Param('symbol') symbol: string,
    @Query('start') start?: string, @Query('end') end?: string,
    @Query('barsLimit') barsLimit?: string, @Query('indicatorParams') indicatorParams?: string,
    @Query('planEnd') planEnd?: string, @Query('timeframe') timeframe?: string,
    @Query('assetType') assetType?: string) {
    if (!this.detailService || !this.chartReader) throw new Error('图表能力服务未注入');
    const query = parseChartOptionsQuery({ start, end, barsLimit, indicatorParams, planEnd, timeframe, assetType });
    const selected = planChartOptionsRequest(await this.detailService.resolveIdentity(symbol), query);
    return { ...await this.chartReader.options(selected.identity, selected.window),
      ...(selected.plan ? { plan: selected.plan } : {}) };
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


function chartBarStatus(pointCount: number, cacheStatus: string) {
  if (pointCount === 0) return 'empty';
  return cacheStatus === 'stale' ? 'stale' : 'ready';
}
function detailCalculationAnchor(input: Parameters<typeof marketCalculationAnchor>[0]) {
  try {
    return marketCalculationAnchor(input);
  } catch {
    throw new BadRequestException('calculationAnchor必须是有效带时区时刻，且与end行情末日一致');
  }
}
function legacyDetailQuery(
  include: MarketDetailCapability[],
  navLimit: number,
  start: string | undefined,
  end: string | undefined,
  refresh: string | undefined,
) {
  return {
    include,
    navLimit,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    refresh: refresh === '1',
  };
}

