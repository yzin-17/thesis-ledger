import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  barSeriesV2Schema,
  canonicalBarSeriesEncoding,
  type BarPointV2,
  type BarSeriesIdentityV2,
  type BarSeriesV2,
  type RouteProvenanceV2,
} from '@thesis-ledger/schemas';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { isFresh, resolveBarFreshUntil } from './market-bar-series-calendar.js';
import { MarketControlService } from './market-control.service.js';
import { normalizeMarketBarWindow, type MarketBarWindow } from './market-bar-window.js';

export const isMarketBarTemporarilyUnavailable = (error: unknown) =>
  error instanceof DsaError && (error.code === 'unavailable' || error.code === 'timeout');

export type BarReadAcceptance = 'interactive' | 'complete' | 'point-in-time';
export const CANONICAL_BAR_ACQUISITION_LIMIT = 3650;
const DISTRIBUTED_LOCK_TTL_MS = 12_000;
export type BarReadInput = {
  identity: BarSeriesIdentityV2;
  window: MarketBarWindow;
  acceptance: BarReadAcceptance;
  refresh?: boolean;
  asOf?: string;
};

type StoredSeries = BarSeriesV2 & { policyRevision: number };

export interface MarketBarPolicyPort {
  read(identity: BarSeriesIdentityV2): Promise<{
    revision: number;
    targets: ReadonlyArray<{ providerId: string; upstreamSource: string; routeIndex: number }>;
  }>;
}

export interface MarketBarRemotePort {
  read(
    input: BarReadInput,
    targets: ReadonlyArray<{ providerId: string; upstreamSource: string; routeIndex: number }>,
  ): Promise<BarSeriesV2>;
}

const canonicalPoints = (points: readonly BarPointV2[]) =>
  points
    .map((point) => ({ ...point }))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

export const barSeriesInputFingerprint = (
  identity: BarSeriesIdentityV2,
  points: readonly BarPointV2[],
) =>
  createHash('sha256')
    .update(canonicalBarSeriesEncoding(identity, canonicalPoints(points)))
    .digest('hex');

/** 对返回窗口切片并重新计算指纹；内部缓存字段不进入公开响应。 */
export const sliceBarSeries = (series: BarSeriesV2, requested: MarketBarWindow): BarSeriesV2 => {
  const window = normalizeMarketBarWindow(series.identity.symbol, requested);
  const start = window.start ? Date.parse(window.start) : Number.NEGATIVE_INFINITY;
  const end = window.end ? Date.parse(window.end) : Number.POSITIVE_INFINITY;
  const points = series.points.filter((point) => {
    const timestamp = Date.parse(point.timestamp);
    return timestamp >= start && timestamp <= end;
  });
  const sliced = window.limit ? points.slice(-window.limit) : points;
  const first = sliced[0];
  return barSeriesV2Schema.parse({
    ...series,
    points: sliced,
    coverage: {
      ...series.coverage,
      actualStart: first?.timestamp ?? null,
      actualEnd: sliced.at(-1)?.timestamp ?? null,
      hasMoreBefore:
        series.coverage.hasMoreBefore ||
        Boolean(
          first &&
          series.points.some((point) => Date.parse(point.timestamp) < Date.parse(first.timestamp)),
        ),
    },
    inputFingerprint: barSeriesInputFingerprint(series.identity, sliced),
  });
};

const viewKey = (
  input: BarReadInput,
  policyRevision: number,
  targets: ReadonlyArray<{ providerId: string; upstreamSource: string; routeIndex: number }>,
) =>
  `bars-v2:${input.identity.symbol}:${input.identity.assetType}:${input.identity.timeframe}:${input.identity.adjustment}:${input.window.start ?? ''}:${input.window.end ?? ''}:policy-${policyRevision}:route-${targets.map((target) => `${target.routeIndex}-${target.providerId}-${target.upstreamSource}`).join('|')}`;

class InMemorySeriesCache {
  private readonly values = new Map<string, StoredSeries>();
  private readonly flights = new Map<string, Promise<StoredSeries>>();
  get(key: string) {
    return this.values.get(key);
  }
  set(key: string, value: StoredSeries) {
    this.values.set(key, value);
  }
  flight(key: string, work: () => Promise<StoredSeries>) {
    const existing = this.flights.get(key);
    if (existing) return existing;
    const pending = work().finally(() => this.flights.delete(key));
    this.flights.set(key, pending);
    return pending;
  }
}

@Injectable()
export class PrismaMarketBarFactStore {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async read(input: BarReadInput, provenance: RouteProvenanceV2): Promise<StoredSeries | null> {
    if (!this.prisma) return null;
    input = { ...input, window: normalizeMarketBarWindow(input.identity.symbol, input.window) };
    const client = this.prisma;
    const coverage = await client.marketBarSeriesCoverage.findUnique({
      where: {
        symbol_timeframe_adjustment_providerId_upstreamSource: {
          symbol: input.identity.symbol,
          timeframe: input.identity.timeframe,
          adjustment: input.identity.adjustment,
          providerId: provenance.providerId,
          upstreamSource: provenance.upstreamSource,
        },
      },
    });
    if (!coverage) return null;
    if (
      input.window.start &&
      coverage.actualStart &&
      new Date(input.window.start) < new Date(coverage.actualStart) &&
      coverage.hasMoreBefore
    )
      return null;
    if (
      input.window.end &&
      coverage.actualEnd &&
      new Date(input.window.end) > new Date(coverage.actualEnd)
    )
      return null;
    const rows = await client.marketBarSeriesFact.findMany({
      where: {
        symbol: input.identity.symbol,
        assetType: input.identity.assetType,
        timeframe: input.identity.timeframe,
        adjustment: input.identity.adjustment,
        providerId: provenance.providerId,
        upstreamSource: provenance.upstreamSource,
        ...(input.window.start || input.window.end
          ? {
              timestamp: {
                ...(input.window.start ? { gte: new Date(input.window.start) } : {}),
                ...(input.window.end ? { lte: new Date(input.window.end) } : {}),
              },
            }
          : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: CANONICAL_BAR_ACQUISITION_LIMIT,
    });
    if (!rows?.length) return null;
    if (
      input.window.limit !== undefined &&
      !input.window.start &&
      !input.window.end &&
      coverage.hasMoreBefore &&
      rows.length < input.window.limit
    )
      return null;
    rows.reverse();
    const points: BarPointV2[] = rows.flatMap((row): BarPointV2[] => {
      const completionStatus = row.completionStatus;
      if (
        completionStatus !== 'complete' &&
        completionStatus !== 'incomplete' &&
        completionStatus !== 'unknown'
      )
        return [];
      return [
        {
          timestamp: new Date(row.timestamp).toISOString(),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume),
          amount: Number(row.amount),
          completionStatus,
          availableAt: new Date(row.availableAt).toISOString(),
        },
      ];
    });
    const parsed = barSeriesV2Schema.parse({
      contractVersion: 2,
      identity: input.identity,
      points,
      coverage: {
        actualStart: coverage.actualStart?.toISOString() ?? points[0]?.timestamp ?? null,
        actualEnd: coverage.actualEnd?.toISOString() ?? points.at(-1)?.timestamp ?? null,
        hasMoreBefore: coverage.hasMoreBefore,
        latestCompleteTradingDate: coverage.latestCompleteTradingDate
          ? new Date(coverage.latestCompleteTradingDate).toISOString().slice(0, 10)
          : null,
      },
      provenance: {
        ...provenance,
        providerRevision: String(coverage.providerRevision),
        fetchedAt: new Date(coverage.fetchedAt).toISOString(),
        freshUntil: new Date(coverage.freshUntil).toISOString(),
        servedFromCache: true,
        cacheStatus: 'postgres',
      },
      inputFingerprint: barSeriesInputFingerprint(input.identity, points),
    });
    return { ...parsed, policyRevision: provenance.effectivePolicyRevision };
  }

  async write(series: BarSeriesV2) {
    if (!this.prisma) return;
    const client = this.prisma;
    const factWrites = series.points.map((point) =>
      client.marketBarSeriesFact.upsert({
        where: {
          symbol_timeframe_timestamp_adjustment_providerId_upstreamSource: {
            symbol: series.identity.symbol,
            timeframe: series.identity.timeframe,
            timestamp: new Date(point.timestamp),
            adjustment: series.identity.adjustment,
            providerId: series.provenance.providerId,
            upstreamSource: series.provenance.upstreamSource,
          },
        },
        update: {
          assetType: series.identity.assetType,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          volume: point.volume,
          amount: point.amount,
          completionStatus: point.completionStatus,
          availableAt: new Date(point.availableAt),
          providerRevision: series.provenance.providerRevision,
          fetchedAt: new Date(series.provenance.fetchedAt),
        },
        create: {
          symbol: series.identity.symbol,
          assetType: series.identity.assetType,
          timeframe: series.identity.timeframe,
          timestamp: new Date(point.timestamp),
          adjustment: series.identity.adjustment,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          volume: point.volume,
          amount: point.amount,
          completionStatus: point.completionStatus,
          availableAt: new Date(point.availableAt),
          providerId: series.provenance.providerId,
          upstreamSource: series.provenance.upstreamSource,
          providerRevision: series.provenance.providerRevision,
          fetchedAt: new Date(series.provenance.fetchedAt),
        },
      }),
    );
    if (client.$transaction) await client.$transaction(factWrites);
    else await Promise.all(factWrites);
    if (!client.marketBarSeriesCoverage) return;
    const coverage = series.coverage;
    const coverageKey = {
      symbol_timeframe_adjustment_providerId_upstreamSource: {
        symbol: series.identity.symbol,
        timeframe: series.identity.timeframe,
        adjustment: series.identity.adjustment,
        providerId: series.provenance.providerId,
        upstreamSource: series.provenance.upstreamSource,
      },
    };
    const existing = await client.marketBarSeriesCoverage.findUnique({ where: coverageKey });
    const existingStart = existing?.actualStart ? new Date(existing.actualStart) : null;
    const existingEnd = existing?.actualEnd ? new Date(existing.actualEnd) : null;
    const nextStart = coverage.actualStart ? new Date(coverage.actualStart) : null;
    const nextEnd = coverage.actualEnd ? new Date(coverage.actualEnd) : null;
    const disjoint = Boolean(
      existingStart &&
      existingEnd &&
      nextStart &&
      nextEnd &&
      (nextEnd < existingStart || nextStart > existingEnd),
    );
    // 单连续段模型不能合并不相交窗口；事实仍保留，后续请求读穿。
    if (disjoint) return;
    const mergedStart =
      existingStart && nextStart
        ? existingStart < nextStart
          ? existingStart
          : nextStart
        : (existingStart ?? nextStart);
    const mergedEnd =
      existingEnd && nextEnd
        ? existingEnd > nextEnd
          ? existingEnd
          : nextEnd
        : (existingEnd ?? nextEnd);
    const newWindowStartsEarlier = Boolean(
      nextStart && (!existingStart || nextStart < existingStart),
    );
    let mergedHasMoreBefore = coverage.hasMoreBefore;
    if (existing) {
      const sameStart = Boolean(
        nextStart && existingStart && nextStart.getTime() === existingStart.getTime(),
      );
      if (!newWindowStartsEarlier)
        mergedHasMoreBefore = existing.hasMoreBefore || (sameStart && coverage.hasMoreBefore);
    }
    const incomingLatest = coverage.latestCompleteTradingDate
      ? new Date(`${coverage.latestCompleteTradingDate}T00:00:00.000Z`)
      : null;
    let mergedLatest = existing?.latestCompleteTradingDate ?? null;
    if (incomingLatest && (!mergedLatest || incomingLatest > new Date(mergedLatest)))
      mergedLatest = incomingLatest;
    const replacesCoverage =
      !existing ||
      Boolean(
        existingStart &&
        existingEnd &&
        nextStart &&
        nextEnd &&
        nextStart <= existingStart &&
        nextEnd >= existingEnd,
      );
    // 只有本次确实复核整段，才能刷新整段有效期。局部更新采用保守下界，
    // 不能让历史窗口的 7/30 天 TTL 使未重新获取的最新行情继续命中。
    const freshUntil = new Date(
      replacesCoverage
        ? Date.parse(series.provenance.freshUntil)
        : Math.min(
            new Date(existing.freshUntil).getTime(),
            Date.parse(series.provenance.freshUntil),
          ),
    );
    const fetchedAt = new Date(
      replacesCoverage
        ? Date.parse(series.provenance.fetchedAt)
        : Math.min(new Date(existing.fetchedAt).getTime(), Date.parse(series.provenance.fetchedAt)),
    );
    await client.marketBarSeriesCoverage.upsert({
      where: coverageKey,
      update: {
        assetType: series.identity.assetType,
        providerRevision: series.provenance.providerRevision,
        fetchedAt,
        freshUntil,
        actualStart: mergedStart,
        actualEnd: mergedEnd,
        hasMoreBefore: mergedHasMoreBefore,
        latestCompleteTradingDate: mergedLatest,
      },
      create: {
        symbol: series.identity.symbol,
        assetType: series.identity.assetType,
        timeframe: series.identity.timeframe,
        adjustment: series.identity.adjustment,
        providerId: series.provenance.providerId,
        upstreamSource: series.provenance.upstreamSource,
        providerRevision: series.provenance.providerRevision,
        fetchedAt: new Date(series.provenance.fetchedAt),
        freshUntil: new Date(series.provenance.freshUntil),
        actualStart: nextStart,
        actualEnd: nextEnd,
        hasMoreBefore: coverage.hasMoreBefore,
        latestCompleteTradingDate: incomingLatest,
      },
    });
  }
}

@Injectable()
export class DsaMarketBarRemotePort implements MarketBarRemotePort {
  constructor(private readonly dsa: DsaClient) {}
  read(input: BarReadInput): Promise<BarSeriesV2> {
    return this.dsa.marketBarsV2({
      symbol: input.identity.symbol,
      assetType: input.identity.assetType,
      timeframe: input.identity.timeframe,
      adjustment: input.identity.adjustment,
      limit: CANONICAL_BAR_ACQUISITION_LIMIT,
      ...(input.window.start ? { start: input.window.start } : {}),
      ...(input.window.end ? { end: input.window.end } : {}),
    });
  }
}

@Injectable()
export class DsaMarketBarPolicyPort implements MarketBarPolicyPort {
  constructor(
    private readonly dsa: DsaClient,
    private readonly control: MarketControlService,
  ) {}
  async read(identity: BarSeriesIdentityV2) {
    const desired = await this.control.getPolicy();
    const desiredRevision = desired.revision;
    if (
      desired.syncState !== 'applied' ||
      desired.enabled !== true ||
      typeof desiredRevision !== 'number' ||
      !Number.isInteger(desiredRevision) ||
      desiredRevision <= 0
    )
      throw new Error('Server 市场策略尚未同步或未启用，拒绝读取行情');
    const envelope = await this.dsa.effectiveControlPolicyV2();
    const effective = envelope.projection?.effective;
    if (
      !effective ||
      effective.enabled !== true ||
      effective.sourceDesiredRevision !== desiredRevision
    )
      throw new Error('DSA effective 市场策略与 Server Desired revision 不一致');
    const status = effective.routeStatus.DAILY_BAR?.[identity.assetType];
    return { revision: effective.revision, targets: status?.eligibleTargets ?? [] };
  }
}

@Injectable()
export class MarketBarReader {
  private readonly cache = new InMemorySeriesCache();
  constructor(
    @Inject(DsaMarketBarPolicyPort) private readonly policy: MarketBarPolicyPort,
    @Inject(DsaMarketBarRemotePort) private readonly remote: MarketBarRemotePort,
    private readonly facts: PrismaMarketBarFactStore,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async read(input: BarReadInput): Promise<BarSeriesV2> {
    input = { ...input, window: normalizeMarketBarWindow(input.identity.symbol, input.window) };
    const policy = await this.policy.read(input.identity);
    const targets = policy.targets;
    if (!targets.length) throw new Error('当前策略没有可用的日线 RouteTarget');
    const policyRevision = policy.revision;
    const key = viewKey(input, policyRevision, targets);
    const cached = !input.refresh
      ? await this.readCache(key, input, targets, policyRevision)
      : null;
    if (cached) {
      const view = sliceBarSeries(cached, input.window);
      if (this.accept(view, input)) return view;
    }
    const stale =
      !input.refresh && input.acceptance === 'interactive'
        ? await this.readCache(key, input, targets, policyRevision, true)
        : null;
    return this.cache
      .flight(key, () =>
        this.withDistributedLock(key, async () => {
          const second = !input.refresh
            ? await this.readCache(key, input, targets, policyRevision)
            : null;
          // 获取和复用不包含调用者的验收结论；每个调用者在共享 Promise 之后独立验收。
          if (second && this.accept(sliceBarSeries(second, input.window), input)) return second;
          const fetched = barSeriesV2Schema.parse(await this.remote.read(input, targets));
          const selectedTarget = targets.find(
            (target) =>
              target.providerId === fetched.provenance.providerId &&
              target.upstreamSource === fetched.provenance.upstreamSource &&
              target.routeIndex === fetched.provenance.routeIndex,
          );
          if (!selectedTarget || fetched.provenance.effectivePolicyRevision !== policyRevision)
            throw new Error('DSA provenance 与当前 RouteTarget 或策略 revision 不一致');
          if (
            fetched.identity.symbol !== input.identity.symbol ||
            fetched.identity.assetType !== input.identity.assetType ||
            fetched.identity.timeframe !== input.identity.timeframe ||
            fetched.identity.adjustment !== input.identity.adjustment
          )
            throw new Error('DSA BarSeries identity 与请求不一致');
          const freshUntil = resolveBarFreshUntil(
            fetched,
            new Date(),
            input.window.end ? { windowEnd: input.window.end } : {},
          );
          const series = barSeriesV2Schema.parse({
            ...fetched,
            provenance: {
              ...fetched.provenance,
              freshUntil: freshUntil.toISOString(),
              servedFromCache: false,
              cacheStatus: 'miss',
            },
            inputFingerprint: barSeriesInputFingerprint(fetched.identity, fetched.points),
          });
          await this.facts.write(series);
          this.cache.set(key, { ...series, policyRevision });
          try {
            await this.writeRedis(key, series);
          } catch {
            // Redis 是可丢弃视图，写失败不覆盖已完成的事实获取。
          }
          return { ...series, policyRevision };
        }),
      )
      .then((series) => {
        const view = sliceBarSeries(series, input.window);
        if (!this.accept(view, input))
          throw new Error(`行情数据不满足 ${input.acceptance} acceptance`);
        return view;
      })
      .catch((error: unknown) => {
        if (stale)
          return sliceBarSeries(
            {
              ...stale,
              provenance: { ...stale.provenance, servedFromCache: true, cacheStatus: 'stale' },
            },
            input.window,
          );
        throw error;
      });
  }

  private async withDistributedLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const client = this.redis?.client;
    if (!client?.set) return work();
    const lockKey = redisKey('lock', `market-bars-v2:${key}`);
    const lockValue = randomUUID();
    let acquired: string | null;
    try {
      acquired = await client.set(lockKey, lockValue, 'PX', DISTRIBUTED_LOCK_TTL_MS, 'NX');
    } catch {
      return work();
    }
    if (acquired !== 'OK') {
      if (client.get) {
        const attempts = Math.ceil(DISTRIBUTED_LOCK_TTL_MS / 200) + 1;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if ((await client.get(lockKey)) === null) break;
        }
      }
      return work();
    }
    try {
      return await work();
    } finally {
      try {
        await client.eval?.(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
          1,
          lockKey,
          lockValue,
        );
      } catch {
        /* TTL 最终释放；不覆盖已完成的读写。 */
      }
    }
  }

  private accept(series: BarSeriesV2, input: BarReadInput) {
    if (
      input.acceptance !== 'interactive' &&
      series.points.some((point) => point.completionStatus !== 'complete')
    )
      return false;
    if (input.acceptance === 'point-in-time') {
      const asOf = input.asOf ? Date.parse(input.asOf) : Number.NaN;
      return (
        Number.isFinite(asOf) &&
        series.points.every((point) => Date.parse(point.availableAt) <= asOf)
      );
    }
    return isFresh(series.provenance.freshUntil, new Date()) || input.acceptance === 'interactive';
  }

  private async readCache(
    key: string,
    input: BarReadInput,
    targets: ReadonlyArray<{ providerId: string; upstreamSource: string; routeIndex: number }>,
    policyRevision: number,
    allowStale = false,
  ): Promise<StoredSeries | null> {
    const local = this.cache.get(key);
    if (local && (allowStale || isFresh(local.provenance.freshUntil, new Date())))
      return {
        ...local,
        provenance: {
          ...local.provenance,
          servedFromCache: true,
          cacheStatus:
            allowStale && !isFresh(local.provenance.freshUntil, new Date()) ? 'stale' : 'memory',
        },
      };
    const redisClient = this.redis?.client;
    if (redisClient?.get) {
      try {
        const raw = await redisClient.get(redisKey('cache', key));
        if (raw) {
          const parsed = barSeriesV2Schema.parse(JSON.parse(raw));
          const target = targets.find(
            (item) =>
              item.providerId === parsed.provenance.providerId &&
              item.upstreamSource === parsed.provenance.upstreamSource &&
              item.routeIndex === parsed.provenance.routeIndex,
          );
          if (
            parsed.provenance.effectivePolicyRevision === policyRevision &&
            target &&
            (allowStale || isFresh(parsed.provenance.freshUntil, new Date()))
          )
            return {
              ...parsed,
              policyRevision,
              provenance: {
                ...parsed.provenance,
                servedFromCache: true,
                cacheStatus:
                  allowStale && !isFresh(parsed.provenance.freshUntil, new Date())
                    ? 'stale'
                    : 'redis',
              },
            };
        }
      } catch {
        /* Redis 失败时继续读取持久事实。 */
      }
    }
    const orderedTargets = [...targets].sort((left, right) => left.routeIndex - right.routeIndex);
    for (const target of orderedTargets) {
      const factSeries = await this.facts.read(input, {
        providerId: target.providerId,
        upstreamSource: target.upstreamSource,
        routeIndex: target.routeIndex,
        effectivePolicyRevision: policyRevision,
        providerRevision: 'source-coverage',
        fetchedAt: new Date(0).toISOString(),
        freshUntil: new Date(0).toISOString(),
        servedFromCache: true,
        cacheStatus: 'postgres',
      });
      if (
        factSeries &&
        factSeries.provenance.effectivePolicyRevision === policyRevision &&
        (allowStale || isFresh(factSeries.provenance.freshUntil, new Date()))
      ) {
        this.cache.set(key, { ...factSeries, policyRevision });
        return factSeries;
      }
    }
    return null;
  }

  private async writeRedis(key: string, series: BarSeriesV2) {
    const redisClient = this.redis?.client;
    if (!redisClient?.set) return;
    const ttl = Math.max(
      1,
      Math.ceil((Date.parse(series.provenance.freshUntil) - Date.now()) / 1000),
    );
    await redisClient.set(redisKey('cache', key), JSON.stringify(series), 'EX', ttl);
  }
}
