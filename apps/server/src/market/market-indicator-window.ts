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

/** 仅规划输入窗口，不实现任何技术指标公式。 */
export const indicatorWarmupPoints = (requests: readonly MarketIndicatorRequest[]) =>
  requests.reduce((maximum, request) => {
    const parameters = request.parameters;
    const warmup = request.name === 'MA'
      ? (parameters.period ?? 5) - 1
      : request.name === 'MACD'
        ? (parameters.slow ?? 26) + (parameters.signal ?? 9)
        : Math.max(parameters.short ?? 6, parameters.mid ?? 12, parameters.long ?? 24) + 1;
    return Math.max(maximum, warmup);
  }, 0);

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

/** DSA 完整输入已经过指纹校验；投影保留该证据，不把显示指纹冒充计算指纹。 */
export const projectIndicatorResponse = (
  response: IndicatorCalculateResponseV2,
  calculation: BarSeriesV2,
  visible: BarSeriesV2,
): IndicatorCalculateResponseV2 => {
  if (response.inputFingerprint !== calculation.inputFingerprint)
    throw new Error('指标计算输入 fingerprint 不一致');
  const timestamps = new Set(visible.points.map((point) => point.timestamp));
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
      points: result.points.filter((point) => timestamps.has(point.timestamp)),
    })),
  });
};
