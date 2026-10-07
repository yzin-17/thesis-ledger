import { z } from 'zod';
import { marketDataBarSeriesResponseV3Schema } from './market-data-wire-v3.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';

const observation = z.strictObject({
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
  response: marketDataBarSeriesResponseV3Schema,
});

const validateTradabilityWindowComposition = (
  parent: z.infer<typeof marketDataBarSeriesResponseV3Schema> & {
    windowObservations: z.infer<typeof observation>[];
  },
  fail: (message: string) => void,
): void => {
  if (
    parent.windowObservations.some(
      (item) =>
        Boolean(item.response.historicalTradabilityWindows) !==
        Boolean(parent.historicalTradabilityWindows),
    )
  ) {
    fail('父子窗口日级证据模式必须一致');
  }
  if (
    parent.historicalTradabilityWindows &&
    JSON.stringify(parent.historicalTradabilityWindows) !==
      JSON.stringify(
        parent.windowObservations.flatMap(
          (item) => item.response.historicalTradabilityWindows ?? [],
        ),
      )
  ) {
    fail('父窗口日级证据必须等于原始子窗口证据');
  }
};

/** 子响应复用严格单窗合同，禁止递归嵌套；哈希真实性由读取/冻结层核对。 */
export const marketDataMultiWindowResponseV3Schema = marketDataBarSeriesResponseV3Schema
  .safeExtend({ windowObservations: z.array(observation).min(2).max(1_000) })
  .superRefine((parent, context) => {
    const fail = (message: string) => context.addIssue({ code: 'custom', message });
    validateTradabilityWindowComposition(parent, fail);
    const latestObservation = Math.max(
      ...parent.windowObservations.map((item) => Date.parse(item.completedAt)),
    );
    if (Date.parse(parent.sourcePriceBasis.observedAt) !== latestObservation) {
      fail('父窗口观测时间必须等于最晚子观测完成时间');
    }
    if (
      parent.sourcePriceBasis.basisScope !== 'request-window' ||
      parent.sourcePriceBasis.revision.origin !== 'local-observation'
    )
      fail('多窗口结果必须保留请求窗口作用域及本地观测修订');
    const union = new Map<string, (typeof parent.bars)[number]>();
    let previousStart: string | undefined;
    let previousTimestamps: Set<string> | undefined;
    for (const item of parent.windowObservations) {
      const child = item.response;
      if (Date.parse(item.startedAt) > Date.parse(item.completedAt)) fail('观测开始晚于完成');
      if (Date.parse(child.sourcePriceBasis.observedAt) > Date.parse(item.completedAt)) {
        fail('子响应观测晚于采集完成');
      }
      if (
        child.symbol !== parent.symbol ||
        marketRouteKeyIdV3(child.routeKey) !== marketRouteKeyIdV3(parent.routeKey) ||
        child.provenance.providerId !== parent.provenance.providerId ||
        child.provenance.upstreamSource !== parent.provenance.upstreamSource ||
        child.provenance.routeIndex !== parent.provenance.routeIndex ||
        child.provenance.effectivePolicyRevision !== parent.provenance.effectivePolicyRevision
      )
        fail('子窗口身份必须与父响应一致');
      if (
        child.coverage.requestedStart < parent.coverage.requestedStart ||
        child.coverage.requestedEnd > parent.coverage.requestedEnd ||
        (previousStart !== undefined && child.coverage.requestedStart <= previousStart)
      )
        fail('子窗口必须在父窗口内且按开始日期严格升序');
      previousStart = child.coverage.requestedStart;
      const basisFields = [
        'adjustment',
        'method',
        'methodVersion',
        'anchor',
        'volumeBasis',
        'dividendMeaning',
        'dividendEvidenceRef',
        'conversionAvailable',
        'conversionEvidenceRef',
      ] as const;
      if (
        basisFields.some(
          (field) => child.sourcePriceBasis[field] !== parent.sourcePriceBasis[field],
        )
      ) {
        fail('子窗口价格协议不兼容');
      }
      if (
        child.sourcePriceBasis.fieldUnits?.volume !== parent.sourcePriceBasis.fieldUnits?.volume ||
        child.sourcePriceBasis.fieldUnits?.amount !== parent.sourcePriceBasis.fieldUnits?.amount
      )
        fail('子窗口单位不兼容');
      const timestamps = new Set(child.bars.map((bar) => bar.timestamp));
      if (previousTimestamps && ![...timestamps].some((value) => previousTimestamps?.has(value))) {
        fail('相邻子窗口必须存在已观测交易日交集');
      }
      previousTimestamps = timestamps;
      for (const bar of child.bars) {
        const existing = union.get(bar.timestamp);
        if (existing && !samePrices(existing, bar)) fail('子窗口重叠行情冲突');
        if (!existing || Date.parse(bar.availableAt) > Date.parse(existing.availableAt)) {
          union.set(bar.timestamp, bar);
        }
      }
    }
    if (
      union.size !== parent.bars.length ||
      parent.bars.some((bar) => {
        const child = union.get(bar.timestamp);
        return (
          !child ||
          !samePrices(child, bar) ||
          Date.parse(child.availableAt) !== Date.parse(bar.availableAt)
        );
      })
    )
      fail('父响应行情必须等于子窗口事实的去重并集');
  });

type Bar = z.infer<typeof marketDataBarSeriesResponseV3Schema>['bars'][number];
const samePrices = (left: Bar, right: Bar) =>
  left.timestamp === right.timestamp &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  left.volume === right.volume &&
  left.amount === right.amount &&
  left.completionStatus === right.completionStatus;

export type MarketDataMultiWindowResponseV3 = z.infer<typeof marketDataMultiWindowResponseV3Schema>;
