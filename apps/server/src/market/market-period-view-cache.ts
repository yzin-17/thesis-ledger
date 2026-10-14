import { Injectable, Optional } from '@nestjs/common';
import { canonicalMarketPeriodEncoding } from '@thesis-ledger/domain';
import {
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  marketPeriodBarSeriesSchema,
  marketPeriodIndicatorContextSchema,
  type BarSeries,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { bindPeriodSource, periodContentFingerprint } from './market-period-source.js';
import { buildMarketPeriodView } from './market-period-view.js';
import { planMarketPeriodWindow, type MarketPeriodWindowInput } from './market-period-window.js';
import { compareDecisionClockV3 } from './market-pit-decision-window-calendar-v3.js';

const slotSchema = z.strictObject({
  series: marketPeriodBarSeriesSchema,
  periodContext: marketPeriodIndicatorContextSchema,
});
const windowsSchema = z.strictObject({ visible: slotSchema, calculation: slotSchema });
const envelopeSchema = z.strictObject({
  protocol: z.literal('market-period-view-cache-v1'),
  key: z.string(),
  contentFingerprint: z.string(),
  windows: windowsSchema,
});
type Binding = ReturnType<typeof bindPeriodSource>;
type Slot = z.infer<typeof slotSchema>;
const TTL_SECONDS = 60;

function matchesCoverage(series: Slot['series'], hasMoreBefore: boolean) {
  return (
    series.coverage.hasMoreBefore === hasMoreBefore &&
    series.coverage.actualStart === (series.points[0]?.timestamp ?? null) &&
    series.coverage.actualEnd === (series.points.at(-1)?.timestamp ?? null) &&
    series.coverage.latestCompleteTradingDate ===
      (series.points.filter((point) => point.completionStatus === 'complete').at(-1)?.tradingDate ??
        null)
  );
}

function assertSlot(
  slot: Slot,
  binding: Binding,
  input: MarketPeriodWindowInput,
  hasMoreBefore: boolean,
) {
  const series = slot.series;
  const derivation = series.derivation;
  if (
    JSON.stringify(series.identity) !==
      JSON.stringify({ ...binding.source.identity, timeframe: input.timeframe }) ||
    derivation.baseInputFingerprint !== binding.baseInputFingerprint ||
    derivation.priceBasisFingerprint !== binding.priceBasisFingerprint ||
    derivation.calendarRevision !== input.calendar.revision ||
    derivation.evaluationAsOf !== input.evaluationAsOf ||
    derivation.anchorTradingDate !== input.anchorTradingDate ||
    derivation.coverageEvidence.length !== 0 ||
    !matchesCoverage(series, hasMoreBefore) ||
    series.points.some(
      (point) => compareDecisionClockV3(point.availableAt, input.evaluationAsOf) > 0,
    )
  )
    throw new Error('派生缓存元数据错配');
  const expectedSources = [
    {
      providerId: binding.source.provenance.providerId,
      upstreamSource: binding.source.provenance.upstreamSource,
      providerRevision: binding.source.provenance.providerRevision,
      inputFingerprint: binding.source.inputFingerprint,
      priceBasisFingerprint: binding.priceBasisFingerprint,
    },
  ];
  if (JSON.stringify(series.provenance.baseSources) !== JSON.stringify(expectedSources))
    throw new Error('派生缓存来源错配');
  const aggregationFingerprint = periodContentFingerprint(
    canonicalMarketPeriodEncoding({
      symbol: series.identity.symbol,
      adjustment: series.identity.adjustment,
      priceBasisFingerprint: binding.priceBasisFingerprint,
      kind: 'derived',
      provider: 'thesis-ledger-server',
      providerRevision: 'market-period-aggregation-v1',
      timeframe: input.timeframe,
      calendarRevision: input.calendar.revision,
      baseInputFingerprint: binding.baseInputFingerprint,
      evaluationAsOf: input.evaluationAsOf,
      ...(input.anchorTradingDate ? { anchorTradingDate: input.anchorTradingDate } : {}),
      coverageEvidence: [],
      points: series.points,
    }),
  );
  if (
    slot.periodContext.aggregationFingerprint !== aggregationFingerprint ||
    slot.periodContext.pointFingerprint !==
      periodContentFingerprint(canonicalBarSeriesEncoding(series.identity, series.points)) ||
    series.inputFingerprint !==
      periodContentFingerprint(canonicalMarketPeriodIndicatorEncoding(slot.periodContext))
  )
    throw new Error('派生缓存指纹错配');
}

/** 缓存只保存成功派生结果；显式时刻入 key，不跨完成边界复用。 */
@Injectable()
export class MarketPeriodViewCache {
  private readonly memory = new Map<string, { expiresAt: number; raw: string }>();
  constructor(@Optional() private readonly redis?: RedisService) {}

  private async get(key: string) {
    const local = this.memory.get(key);
    if (local && local.expiresAt > Date.now()) return local.raw;
    this.memory.delete(key);
    try {
      return (await this.redis?.client?.get(redisKey('cache', key))) ?? null;
    } catch {
      return null;
    }
  }

  private async set(key: string, raw: string) {
    this.memory.set(key, { expiresAt: Date.now() + TTL_SECONDS * 1000, raw });
    if (this.memory.size > 128) {
      const first = this.memory.keys().next().value;
      if (first) this.memory.delete(first);
    }
    try {
      await this.redis?.client?.set(redisKey('cache', key), raw, 'EX', TTL_SECONDS);
    } catch {
      /* 已取得的有效派生结果不依赖 Redis 写入成功。 */
    }
  }

  async resolve(source: BarSeries, input: MarketPeriodWindowInput, refresh = false) {
    const binding = bindPeriodSource(source, input.evaluationAsOf);
    const plan = planMarketPeriodWindow(input);
    const key =
      'market-period-view-v1:' +
      periodContentFingerprint(
        JSON.stringify([
          binding.baseInputFingerprint,
          binding.priceBasisFingerprint,
          source.coverage,
          source.chartContextV3,
          {
            calendar: input.calendar,
            timeframe: input.timeframe,
            anchorTradingDate: input.anchorTradingDate,
            evaluationAsOf: input.evaluationAsOf,
            start: input.start,
            end: input.end,
            limit: input.limit,
            indicators: input.indicators,
          },
        ]),
      );
    if (!refresh) {
      const raw = await this.get(key);
      if (raw) {
        try {
          const cached = envelopeSchema.parse(JSON.parse(raw));
          if (
            cached.key !== key ||
            cached.contentFingerprint !== periodContentFingerprint(JSON.stringify(cached.windows))
          )
            throw new Error('派生缓存内容损坏');
          const firstVisible = cached.windows.visible.series.points[0];
          const hasMoreBefore =
            firstVisible !== undefined &&
            (cached.windows.calculation.series.points.some(
              (point) => point.timestamp < firstVisible.timestamp,
            ) ||
              (source.coverage.hasMoreBefore && plan.calendarHasEarlierBucket));
          assertSlot(cached.windows.visible, binding, input, hasMoreBefore);
          assertSlot(cached.windows.calculation, binding, input, source.coverage.hasMoreBefore);
          return {
            status: 'hit' as const,
            view: { plan, baseCacheStatus: source.provenance.cacheStatus, ...cached.windows },
          };
        } catch {
          /* 重验失败时只从当前已验证事实重新装配。 */
        }
      }
    }
    const view = buildMarketPeriodView(source, input);
    const windows = windowsSchema.parse({ visible: view.visible, calculation: view.calculation });
    await this.set(
      key,
      JSON.stringify({
        protocol: 'market-period-view-cache-v1',
        key,
        windows,
        contentFingerprint: periodContentFingerprint(JSON.stringify(windows)),
      }),
    );
    return { status: 'miss' as const, view };
  }
}
