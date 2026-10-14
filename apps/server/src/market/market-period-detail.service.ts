import { HttpException, Injectable } from '@nestjs/common';
import type { MarketPeriod } from '@thesis-ledger/domain';
import {
  marketDisplayDetailResponseSchema,
  type MarketDetailCapability,
  type MarketDetailDependency,
  type MarketDetailDiagnostic,
  type MarketDisplayBarSeries,
  type MarketDisplayDetailSection,
} from '@thesis-ledger/schemas';
import {
  MarketDetailService,
  MARKET_DETAIL_CAPABILITIES,
  MARKET_DETAIL_CAPABILITY_MATRIX,
  type ResolvedMarketDetailIdentity,
} from './market-detail.service.js';
import { MarketPeriodDisplayService } from './market-period-display.service.js';
import { normalizeIndicatorName, selectIndicatorParameters } from './market-indicator-request.js';
import { periodAvailabilityReason } from './market-period-availability.js';
import type { MarketIndicatorRequest } from './market-indicator-window.js';

type Input = {
  requested: MarketDetailCapability[];
  barsLimit: number;
  navLimit: number;
  adjustment?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  acceptance?: string | undefined;
  indicatorParams?: string | undefined;
  refresh?: string | undefined;
};
type Sections = Partial<Record<MarketDetailCapability, MarketDisplayDetailSection>>;
const isChart = (capability: MarketDetailCapability) =>
  capability === 'bars' || capability.startsWith('indicator:');
function diagnostic(
  requestId: string,
  capability: MarketDetailCapability,
  reason: string,
): MarketDetailDiagnostic {
  return {
    code: `market_period_${reason}`,
    message: '当前周期的这项行情能力不可得，其他可用分段仍可查看。',
    requestId,
    diagnosticId: `${requestId}:${capability}:${crypto.randomUUID()}`,
  };
}
function failure(
  requestId: string,
  capability: MarketDetailCapability,
  reason: string,
): MarketDisplayDetailSection {
  return { capability, status: 'unavailable', error: diagnostic(requestId, capability, reason) };
}

@Injectable()
export class MarketPeriodDetailService {
  constructor(
    private readonly detail: MarketDetailService,
    private readonly periods: MarketPeriodDisplayService,
  ) {}

  private async feasible(
    symbol: string,
    timeframe: MarketPeriod,
    query: Record<string, string | undefined>,
    requests: MarketIndicatorRequest[],
    sections: Sections,
    requestId: string,
  ) {
    const selected: MarketIndicatorRequest[] = [];
    const evaluationAsOf = new Date().toISOString();
    for (const request of requests) {
      try {
        await this.periods.plan(symbol, timeframe, query, [request], evaluationAsOf);
        selected.push(request);
      } catch (error) {
        sections[`indicator:${request.name}`] = failure(
          requestId,
          `indicator:${request.name}`,
          periodAvailabilityReason(error),
        );
      }
    }
    return selected;
  }

  private async chart(
    identity: ResolvedMarketDetailIdentity,
    timeframe: MarketPeriod,
    input: Input,
    sections: Sections,
    dependencies: Record<string, MarketDetailDependency>,
    requestId: string,
  ) {
    const supported = MARKET_DETAIL_CAPABILITY_MATRIX[identity.assetType];
    const capabilities = input.requested.filter(
      (item) => supported.includes(item) && isChart(item),
    );
    if (!capabilities.length) return undefined;
    const query = {
      assetType: identity.assetType,
      adjustment: input.adjustment ?? 'qfq',
      start: input.start,
      end: input.end,
      limit: String(input.barsLimit),
      acceptance: input.acceptance,
      refresh: input.refresh,
    };
    const requests = capabilities
      .filter((item) => item.startsWith('indicator:'))
      .map((item) => {
        const name = normalizeIndicatorName(item.slice('indicator:'.length));
        return { name, parameters: selectIndicatorParameters(name, input.indicatorParams) };
      });
    const selected = await this.feasible(
      identity.symbol,
      timeframe,
      query,
      requests,
      sections,
      requestId,
    );
    let view;
    try {
      view = await this.periods.read(identity.symbol, timeframe, query, selected);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 400) throw error;
      const reason = periodAvailabilityReason(error);
      dependencies.DAILY_BAR = {
        status: 'unavailable',
        error: diagnostic(requestId, 'bars', reason),
      };
      for (const capability of capabilities)
        sections[capability] = failure(requestId, capability, reason);
      return undefined;
    }
    const series = view.visible.series;
    const status = view.baseCacheStatus === 'stale' ? 'stale' : 'ready';
    dependencies.DAILY_BAR = { status };
    if (input.requested.includes('bars'))
      sections.bars = { capability: 'bars', status, data: series };
    if (selected.length) {
      try {
        const response = await this.periods.calculate(view, selected, input.refresh === '1');
        for (const result of response.results)
          sections[`indicator:${result.name}`] = {
            capability: `indicator:${result.name}`,
            status,
            data: result,
          };
      } catch (error) {
        const reason = periodAvailabilityReason(error);
        for (const request of selected)
          sections[`indicator:${request.name}`] = failure(
            requestId,
            `indicator:${request.name}`,
            reason,
          );
      }
    }
    return series;
  }

  async get(identity: ResolvedMarketDetailIdentity, timeframe: MarketPeriod, input: Input) {
    this.periods.validate(identity.symbol, timeframe, {
      assetType: identity.assetType,
      adjustment: input.adjustment ?? 'qfq',
      start: input.start,
      end: input.end,
      limit: String(input.barsLimit),
      acceptance: input.acceptance,
    });
    // 先校验全部参数，非行情分段也不能掩盖请求错误。
    for (const capability of input.requested.filter((item) => item.startsWith('indicator:')))
      selectIndicatorParameters(
        normalizeIndicatorName(capability.slice('indicator:'.length)),
        input.indicatorParams,
      );
    const requestId = crypto.randomUUID();
    const sections: Sections = {};
    const dependencies: Record<string, MarketDetailDependency> = {};
    const supported = MARKET_DETAIL_CAPABILITY_MATRIX[identity.assetType];
    const nonChart = input.requested.filter((item) => !isChart(item));
    if (nonChart.length) {
      const legacy = await this.detail.getDetail(identity.symbol, {
        include: nonChart,
        navLimit: input.navLimit,
        ...(input.start ? { start: input.start } : {}),
        ...(input.end ? { end: input.end } : {}),
        refresh: input.refresh === '1',
      });
      Object.assign(sections, legacy.sections);
      Object.assign(dependencies, legacy.dependencies);
    }
    for (const capability of input.requested.filter((item) => !supported.includes(item)))
      sections[capability] = {
        capability,
        status: 'unsupported',
        error: diagnostic(requestId, capability, 'asset_unsupported'),
      };
    const barSeries: MarketDisplayBarSeries | undefined = await this.chart(
      identity,
      timeframe,
      input,
      sections,
      dependencies,
      requestId,
    );
    return marketDisplayDetailResponseSchema.parse({
      contractVersion: 3,
      symbol: identity.symbol,
      assetType: identity.assetType,
      identity: { source: identity.source, status: identity.status },
      requested: input.requested,
      capabilities: {
        supported: [...supported],
        unsupported: MARKET_DETAIL_CAPABILITIES.filter((item) => !supported.includes(item)),
      },
      limits: {
        bars: input.barsLimit,
        nav: input.navLimit,
        barsHasMoreBefore: barSeries?.coverage.hasMoreBefore ?? false,
      },
      ...(barSeries ? { barSeries } : {}),
      sections,
      dependencies,
      requestId,
      generatedAt: new Date().toISOString(),
    });
  }
}
