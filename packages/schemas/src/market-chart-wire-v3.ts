import { z } from 'zod';
import {
  marketCalendarTimezonesV3,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  marketDataRouteTargetPinV3Schema,
} from './market-data-wire-v3.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';

/** Interactive observations never constitute a complete backtest window. */
export const marketChartBarsRequestV3Schema = marketDataBarSeriesRequestV3Schema
  .safeExtend({
    purpose: z.literal('interactive-chart'),
    routeTarget: marketDataRouteTargetPinV3Schema,
  })
  .superRefine((request, context) => {
    if (request.routeKey.timeframe !== '1d') {
      context.addIssue({ code: 'custom', path: ['routeKey'], message: '交互图表当前仅支持日线' });
    }
  });
export type MarketChartBarsRequestV3 = z.infer<typeof marketChartBarsRequestV3Schema>;

const completeShape = marketDataBarSeriesResponseV3Schema.shape;
export const marketChartBarsResponseV3Schema = z
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
  })
  .superRefine((response, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    if (response.routeKey.timeframe !== '1d') issue(['routeKey'], '交互图表当前仅支持日线');
    if (response.sourcePriceBasis.adjustment !== response.routeKey.adjustment) {
      issue(['sourcePriceBasis', 'adjustment'], '来源价格口径必须匹配路由');
    }
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
        issue(['bars', index, 'timestamp'], '日线必须处于请求日期窗口');
      }
      if (date === previousDate) issue(['bars', index, 'timestamp'], '同一交易日不得重复');
      previousDate = date;
      if (point.completionStatus === 'complete') latestComplete = date;
      if (Date.parse(point.availableAt) > Date.parse(response.sourcePriceBasis.observedAt)) {
        issue(['bars', index, 'availableAt'], '可用时间不能晚于本次来源观测时间');
      }
    }
    if (response.coverage.actualStart !== (response.bars[0]?.timestamp ?? null)) {
      issue(['coverage', 'actualStart'], '实际起点必须匹配首条日线');
    }
    if (response.coverage.actualEnd !== (response.bars.at(-1)?.timestamp ?? null)) {
      issue(['coverage', 'actualEnd'], '实际终点必须匹配末条日线');
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
