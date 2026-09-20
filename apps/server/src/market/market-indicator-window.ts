import { BadRequestException } from '@nestjs/common';
import {
  indicatorCalculateResponseV2Schema,
  type BarSeriesV2,
  type IndicatorCalculateResponseV2,
} from '@thesis-ledger/schemas';
import { sliceBarSeries, type BarReadInput } from './market-bar-reader.js';

export type MarketIndicatorRequest = {
  name: 'MA' | 'MACD' | 'RSI';
  parameters: Record<string, number>;
};
export const MAX_INDICATOR_INPUT_POINTS = 365;
/**
 * DSA 的 MA 结果固定回传 ma5/ma10/ma20/ma60，与请求的 period 无关。
 * 预热多读不会出错，少读会在显示窗口左边缘留下均线空档，因此按最长默认均线取上限。
 */
const MA_LONGEST_DEFAULT_PERIOD = 60;

const warmupForRequest = (request: MarketIndicatorRequest) => {
  const parameters = request.parameters;
  switch (request.name) {
    case 'MA': return Math.max(parameters.period ?? 5, MA_LONGEST_DEFAULT_PERIOD) - 1;
    case 'MACD': return (parameters.slow ?? 26) + (parameters.signal ?? 9);
    case 'RSI': return Math.max(parameters.short ?? 6, parameters.mid ?? 12, parameters.long ?? 24) + 1;
  }
};

/** 仅规划输入窗口，不实现任何技术指标公式。 */
export const indicatorWarmupPoints = (requests: readonly MarketIndicatorRequest[]) =>
  requests.reduce((maximum, request) => Math.max(maximum, warmupForRequest(request)), 0);

export const indicatorReadInput = (
  input: BarReadInput,
  requests: readonly MarketIndicatorRequest[],
): BarReadInput => {
  const visibleLimit = input.window.limit ?? 90;
  const limit = visibleLimit + indicatorWarmupPoints(requests);
  if (limit > MAX_INDICATOR_INPUT_POINTS)
    throw new BadRequestException(`可见窗口加预热窗口不能超过 ${MAX_INDICATOR_INPUT_POINTS} 根 bar`);
  return {
    ...input,
    // 不把显示起点当作计算起点；向同一结束时刻之前读取预热事实。
    window: { ...(input.window.end ? { end: input.window.end } : {}), limit },
  };
};

export const indicatorWindows = (
  acquired: BarSeriesV2,
  input: BarReadInput,
  requests: readonly MarketIndicatorRequest[],
) => {
  const visible = sliceBarSeries(acquired, { ...input.window, limit: input.window.limit ?? 90 });
  const end = visible.points.at(-1)?.timestamp;
  const calculation = end
    ? sliceBarSeries(acquired, { end, limit: visible.points.length + indicatorWarmupPoints(requests) })
    : visible;
  return { visible, calculation };
};

/**
 * DSA 回传的是带偏移的 ISO 写法（`2026-03-18T00:00:00+00:00`），BarSeries 用 `…000Z`。
 * 契约两者都合法，因此按时刻比对，不按字符串比对。
 */
const instantOf = (value: string) => Date.parse(value);

/** DSA 完整输入已经过指纹校验；投影保留该证据，不把显示指纹冒充计算指纹。 */
export const projectIndicatorResponse = (
  response: IndicatorCalculateResponseV2,
  calculation: BarSeriesV2,
  visible: BarSeriesV2,
): IndicatorCalculateResponseV2 => {
  if (response.inputFingerprint !== calculation.inputFingerprint)
    throw new Error('指标计算输入 fingerprint 不一致');
  // 时刻 -> BarSeries 规范写法，投影同时把指标点位归一到与可见 BarSeries 相同的时间戳格式。
  const visibleTimestamps = new Map(
    visible.points.map((point) => [instantOf(point.timestamp), point.timestamp] as const),
  );
  return indicatorCalculateResponseV2Schema.parse({
    ...response,
    inputFingerprint: visible.inputFingerprint,
    results: response.results.map((result) => ({
      ...result,
      inputFingerprint: visible.inputFingerprint,
      calculationInput: {
        inputFingerprint: calculation.inputFingerprint,
        actualStart: calculation.coverage.actualStart,
        actualEnd: calculation.coverage.actualEnd,
        pointCount: calculation.points.length,
      },
      points: result.points.flatMap((point) => {
        const timestamp = visibleTimestamps.get(instantOf(point.timestamp));
        return timestamp ? [{ ...point, timestamp }] : [];
      }),
    })),
  });
};
