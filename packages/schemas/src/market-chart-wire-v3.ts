import { z } from 'zod';
import {
  marketCalendarTimezonesV3,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  marketDataRouteTargetPinV3Schema,
} from './market-data-wire-v3.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';

const supportedChartRoute = (key: { timeframe: string; market: string; assetType: string; adjustment: string }) =>
  key.timeframe === '1d' ||
  (['1m', '5m', '15m', '30m', '60m'].includes(key.timeframe) && ['CN', 'HK', 'US'].includes(key.market) &&
    ['STOCK', 'ETF'].includes(key.assetType) && key.adjustment === 'none');

const chartSymbolMarket = (symbol: string) => {
  if (/\.(SH|SZ|BJ)$/.test(symbol)) return 'CN';
  if (symbol.endsWith('.HK')) return 'HK';
  if (symbol.endsWith('.US')) return 'US';
  return undefined;
};

/** Interactive observations never constitute a complete backtest window. */
export const marketChartBarsRequestV3Schema = marketDataBarSeriesRequestV3Schema
  .safeExtend({
    purpose: z.literal('interactive-chart'),
    routeTarget: marketDataRouteTargetPinV3Schema,
  })
  .superRefine((request, context) => {
    if (!supportedChartRoute(request.routeKey) || (request.routeKey.timeframe !== '1d' && chartSymbolMarket(request.symbol) !== request.routeKey.market)) {
      context.addIssue({ code: 'custom', path: ['routeKey'], message: '分钟图表仅支持中港美股票/ETF不复权正常时段' });
    }
  });
export type MarketChartBarsRequestV3 = z.infer<typeof marketChartBarsRequestV3Schema>;

const completeShape = marketDataBarSeriesResponseV3Schema.shape;
const chartResponseFields = z
  .strictObject({
    contractVersion: completeShape.contractVersion,
    purpose: z.literal('interactive-chart'),
    requestId: completeShape.requestId,
    symbol: completeShape.symbol,
    routeKey: completeShape.routeKey,
    bars: completeShape.bars,
    coverage: completeShape.coverage,
    sourcePriceBasis: completeShape.sourcePriceBasis,
    provenance: completeShape.provenance,
    inputFingerprint: completeShape.inputFingerprint,
    session: z.literal('regular').optional(),
    timestampConvention: z.enum(['interval-start', 'interval-end', 'source-native']).optional(),
  });

type ChartResponse = z.infer<typeof chartResponseFields>;
type ChartIssue = (path: (string | number)[], message: string) => void;

function validateChartResponseProtocol(response: ChartResponse, issue: ChartIssue): void {
  if (!supportedChartRoute(response.routeKey) || (response.routeKey.timeframe !== '1d' && chartSymbolMarket(response.symbol) !== response.routeKey.market)) issue(['routeKey'], '分钟图表仅支持中港美股票/ETF不复权正常时段');
  const minute = response.routeKey.timeframe !== '1d';
  if (minute && response.timestampConvention === 'source-native' && response.bars.some((point) => point.completionStatus !== 'unknown')) issue(['bars'], '来源时间约定未知时完成状态必须保持未知');
  if (minute && response.session !== 'regular') issue(['session'], '分钟图表必须声明正常交易时段');
  if (response.sourcePriceBasis.adjustment !== response.routeKey.adjustment)
    issue(['sourcePriceBasis', 'adjustment'], '来源价格口径必须匹配路由');
}

function validateMinuteBarClock(response: ChartResponse, point: ChartResponse['bars'][number], index: number, issue: ChartIssue): void {
  if (Date.parse(point.timestamp) % 60_000 !== 0) issue(['bars', index, 'timestamp'], '分钟时间必须对齐整分钟');
  if (point.completionStatus === 'complete' &&
    Date.parse(point.timestamp) + (response.timestampConvention === 'interval-end' ? 0 : Number.parseInt(response.routeKey.timeframe, 10) * 60_000) > Date.parse(response.sourcePriceBasis.observedAt))
    issue(['bars', index, 'completionStatus'], '分钟结束晚于观察时间，不能声明完成');
  if (Date.parse(point.timestamp) > Date.parse(response.sourcePriceBasis.observedAt))
    issue(['bars', index, 'timestamp'], '分钟时间不能晚于来源观察时间');
}

export const marketChartBarsResponseV3Schema = chartResponseFields
  .superRefine((response, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    validateChartResponseProtocol(response, issue);
    const minute = response.routeKey.timeframe !== '1d';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: marketCalendarTimezonesV3[response.routeKey.market],
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    let previousDate: string | undefined;
    let latestComplete: string | null = null;
    for (const [index, point] of response.bars.entries()) {
      const parts = new Map(
        formatter.formatToParts(new Date(point.timestamp)).map(({ type, value }) => [type, value]),
      );
      const date = `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
      if (date < response.coverage.requestedStart || date > response.coverage.requestedEnd) {
        issue(['bars', index, 'timestamp'], 'K线必须处于请求日期窗口');
      }
      if (!minute && date === previousDate) issue(['bars', index, 'timestamp'], '同一交易日不得重复');
      previousDate = date;
      if (minute) validateMinuteBarClock(response, point, index, issue);
      if (!minute && point.completionStatus === 'complete') latestComplete = date;
      if (Date.parse(point.availableAt) > Date.parse(response.sourcePriceBasis.observedAt)) {
        issue(['bars', index, 'availableAt'], '可用时间不能晚于本次来源观测时间');
      }
    }
    if (response.coverage.actualStart !== (response.bars[0]?.timestamp ?? null)) {
      issue(['coverage', 'actualStart'], '实际起点必须匹配首条K线');
    }
    if (response.coverage.actualEnd !== (response.bars.at(-1)?.timestamp ?? null)) {
      issue(['coverage', 'actualEnd'], '实际终点必须匹配末条K线');
    }
    if (response.coverage.latestCompleteTradingDate !== latestComplete) {
      issue(['coverage', 'latestCompleteTradingDate'], '最近完整交易日必须来自返回的完整日线');
    }
  });
export type MarketChartBarsResponseV3 = z.infer<typeof marketChartBarsResponseV3Schema>;

export const marketChartBarsRequestResponseV3Schema = z
  .strictObject({
    request: marketChartBarsRequestV3Schema,
    response: marketChartBarsResponseV3Schema,
  })
  .superRefine(({ request, response }, context) => {
    const matches =
      request.requestId === response.requestId &&
      request.symbol === response.symbol &&
      marketRouteKeyIdV3(request.routeKey) === marketRouteKeyIdV3(response.routeKey) &&
      request.start === response.coverage.requestedStart &&
      request.end === response.coverage.requestedEnd &&
      request.routeTarget.providerId === response.provenance.providerId &&
      request.routeTarget.upstreamSource === response.provenance.upstreamSource &&
      request.routeTarget.routeIndex === response.provenance.routeIndex;
    if (!matches)
      context.addIssue({
        code: 'custom',
        path: ['response'],
        message: '图表响应身份、窗口和来源必须与请求一致',
      });
  });
