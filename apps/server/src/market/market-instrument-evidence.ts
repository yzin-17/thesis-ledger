import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  marketNewsDefaultWindowMs,
  marketNewsDefaultPageSize,
  type MarketInstrumentFact,
} from '@thesis-ledger/schemas';
import { MarketActionCoverage } from './market-action-coverage.js';
import { MarketNewsReader } from './market-news-reader.js';
import { MarketBarReader } from './market-bar-reader.js';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import { MarketReportMetadataRepository } from './market-report-metadata.repository.js';

/** 按采集时刻读取已落库资料，外部来源不会在重放时补入新的证据。 */
@Injectable()
export class MarketInstrumentEvidence {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketWindowEvidenceV3Repository)
    private readonly windows: MarketWindowEvidenceV3Repository,
    @Inject(MarketReportMetadataRepository)
    private readonly reports: MarketReportMetadataRepository,
    @Inject(MarketActionCoverage) private readonly actions: MarketActionCoverage,
    @Inject(MarketNewsReader) private readonly news: MarketNewsReader,
    @Inject(MarketBarReader) private readonly bars: MarketBarReader,
  ) {}
  async prepare(
    p: {
      market: 'CN' | 'HK' | 'US';
      instruments: readonly { symbol: string; assetType: 'STOCK' | 'ETF' }[];
    },
    day: string,
  ) {
    const start = new Date(Date.parse(day + 'T00:00:00Z') - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (let i = 0; i < p.instruments.length; i += 4) {
      await Promise.allSettled(
        p.instruments.slice(i, i + 4).map((item) =>
          this.bars.readV3({
            symbol: item.symbol,
            market: p.market,
            routeKey: {
              kind: 'bar',
              market: p.market,
              assetType: item.assetType,
              capability: 'DAILY_BAR',
              timeframe: '1d',
              adjustment: 'none',
            },
            window: { start, end: day },
          }),
        ),
      );
    }
  }
  async recentNews(
    p: {
      market: 'CN' | 'HK' | 'US';
      timeZone: string;
      instruments: readonly { symbol: string; assetType: 'STOCK' | 'ETF' }[];
    },
    deadline: Date,
  ) {
    const end = new Date(),
      windowStart = new Date(end.getTime() - marketNewsDefaultWindowMs);
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: p.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const facts: MarketInstrumentFact[] = [];
    for (let offset = 0; offset < p.instruments.length; offset += 4) {
      const ms = Math.min(5000, deadline.getTime() - Date.now());
      if (ms < 100) break;
      const batch = await Promise.allSettled(
        p.instruments.slice(offset, offset + 4).map(async (i) => {
          const page = await this.news.read(
            {
              instrument: { symbol: i.symbol, market: p.market, assetType: i.assetType },
              publishedStart: windowStart.toISOString(),
              publishedEnd: end.toISOString(),
              limit: marketNewsDefaultPageSize,
              requestBudgetMs: ms,
            },
            AbortSignal.timeout(ms),
          );
          const items: MarketInstrumentFact[] = [];
          for (const item of page.items) {
            if (
              !item.publishedAt ||
              !item.relatedInstruments.some(
                (v) =>
                  v.symbol === i.symbol && v.market === p.market && v.assetType === i.assetType,
              )
            )
              continue;
            const fetched = new Date(
              Math.max(
                Date.parse(item.fetchedAt),
                Date.now(),
                Date.parse(item.sourceAvailableAt ?? item.fetchedAt),
              ),
            );
            items.push({
              kind: 'news',
              ref: i.symbol + ':' + item.id,
              symbol: i.symbol,
              date: date.format(new Date(item.publishedAt)),
              availableAt: fetched.toISOString(),
              publishedAt: new Date(item.publishedAt).toISOString(),
              title: item.title,
              publisher: item.publisher,
              url: item.originalUrl ?? item.url,
              excerpt: item.excerpt?.slice(0, 500) ?? null,
            });
          }
          return items;
        }),
      );
      for (const r of batch) if (r.status === 'fulfilled') facts.push(...r.value);
    }
    return facts;
  }
  async corporateActions(
    p: {
      market: 'CN' | 'HK' | 'US';
      startsOn: string;
      instruments: readonly { symbol: string; assetType: 'ETF' | 'STOCK' }[];
    },
    day: string,
    held: Set<string>,
  ) {
    const result: Record<string, string[]> = {};
    const now = new Date();
    for (const i of p.instruments.filter((i) => held.has(i.symbol))) {
      try {
        const covered = await this.actions.read(
          { ...i, market: p.market, previousDay: p.startsOn, now },
          day,
        );
        if (covered) result[i.symbol] = covered;
      } catch {
        /* 缺少覆盖的标的在收盘估值中单列。 */
      }
    }
    return result;
  }
  async read(
    p: {
      market: 'CN' | 'HK' | 'US';
      timeZone: string;
      instruments: readonly { instrumentId: string; symbol: string; assetType: 'STOCK' | 'ETF' }[];
    },
    day: string,
    asOf: Date,
  ) {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: p.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const unique = new Map<string, MarketInstrumentFact>();
    const session = new Date(day + 'T00:00:00Z');
    for (const instrument of p.instruments) {
      const row = await this.db.marketBarWindowEvidenceV3.findFirst({
        where: {
          symbol: instrument.symbol,
          market: p.market,
          assetType: instrument.assetType,
          routeKind: 'bar',
          timeframe: '1d',
          adjustment: 'none',
          requestedEnd: { gte: session },
          requestedStart: { lte: session },
          fetchedAt: { lte: asOf },
          completeResponseHash: { not: null },
        },
        orderBy: [{ fetchedAt: 'desc' }, { identityFingerprint: 'asc' }],
        select: { identityFingerprint: true, fetchedAt: true },
      });
      const window = row && (await this.windows.findFrozen(row.identityFingerprint));
      if (window && Date.parse(window.response.sourcePriceBasis.observedAt) <= asOf.getTime()) {
        for (const point of window.response.bars
          .filter(
            (b) =>
              b.completionStatus === 'complete' &&
              b.close > 0 &&
              Date.parse(b.timestamp) <= asOf.getTime() &&
              Date.parse(b.availableAt) <= asOf.getTime(),
          )
          .slice(-20)) {
          const observed = date.format(new Date(point.timestamp));
          if (observed > day) continue;
          const ref = 'bar:' + row.identityFingerprint + ':' + observed;
          unique.set(ref, {
            kind: 'daily_bar',
            ref,
            date: observed,
            symbol: instrument.symbol,
            availableAt: new Date(
              Math.max(row.fetchedAt.getTime(), Date.parse(point.availableAt)),
            ).toISOString(),
            observedAt: new Date(point.timestamp).toISOString(),
            open: new Prisma.Decimal(point.open).toFixed(),
            high: new Prisma.Decimal(point.high).toFixed(),
            low: new Prisma.Decimal(point.low).toFixed(),
            close: new Prisma.Decimal(point.close).toFixed(),
          });
        }
      }
      const list = await this.db.marketReportMetadataSnapshot.findMany({
        where: { instrumentId: instrument.instrumentId, collectedAt: { lte: asOf } },
        select: { id: true },
        orderBy: [{ collectedAt: 'desc' }, { id: 'asc' }],
        take: 1,
      });
      if (!list[0]) continue;
      const snapshot = await this.reports.read(list[0].id);
      for (const report of snapshot.page.items) {
        if (report.publishedDate > day) continue;
        const ref = 'report:' + snapshot.snapshotId + ':' + report.sourceReportId;
        unique.set(ref, {
          kind: 'report',
          ref,
          symbol: instrument.symbol,
          date: report.publishedDate,
          availableAt: snapshot.collectedAt,
          title: report.title,
          publisher: report.publisher,
          url: report.originalUrl,
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.ref.localeCompare(b.ref));
  }
}
