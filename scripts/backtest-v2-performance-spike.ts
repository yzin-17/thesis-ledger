import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { LocalArtifactStore } from '../apps/server/src/backtest/backtest-artifact-store.js';
import { aggregateMinuteBars } from '../packages/domain/src/backtest-data.js';
import { evaluateIndicator } from '../packages/domain/src/backtest-indicators.js';
import { tradingCalendars, type TradingMarket } from '../packages/domain/src/trading-calendar.js';

type BenchmarkBar = {
  symbol: string;
  market: TradingMarket;
  timeframe: '1m';
  occurredAt: string;
  availableAt: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount: string;
  provider: string;
  providerRevision: string;
};

const localDateTime = (value: Date, timezone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

const utcAtLocalMinute = (date: string, minute: number, timezone: string) => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) throw new Error(`Invalid date: ${date}`);
  let candidate = new Date(Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = localDateTime(candidate, timezone);
    const renderedUtc = Date.UTC(
      Number(rendered.date.slice(0, 4)),
      Number(rendered.date.slice(5, 7)) - 1,
      Number(rendered.date.slice(8, 10)),
      Math.floor(rendered.minute / 60),
      rendered.minute % 60,
    );
    const wantedUtc = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
    candidate = new Date(candidate.getTime() - (renderedUtc - wantedUtc));
    if (rendered.date === date && rendered.minute === minute) break;
  }
  return candidate;
};

const dates = (start: string, days: number) => {
  const output: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (output.length < days) {
    if (cursor.getUTCDay() > 0 && cursor.getUTCDay() < 6)
      output.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output;
};

const buildBars = (market: TradingMarket, symbol: string, tradingDays: number): BenchmarkBar[] => {
  const calendar = tradingCalendars[market];
  const bars: BenchmarkBar[] = [];
  let sequence = 0;
  for (const date of dates('2026-01-05', tradingDays)) {
    for (const session of calendar.sessionsForDate(`${date}T00:00:00Z`)) {
      for (let minute = session.start; minute < session.end; minute += 1) {
        const occurred = utcAtLocalMinute(date, minute, calendar.timezone);
        const occurredAt = occurred.toISOString();
        const availableAt = new Date(occurred.getTime() + 60_000).toISOString();
        const close = (100 + sequence * 0.01).toFixed(4);
        bars.push({
          symbol,
          market,
          timeframe: '1m',
          occurredAt,
          availableAt,
          open: close,
          high: (Number(close) + 0.02).toFixed(4),
          low: (Number(close) - 0.02).toFixed(4),
          close,
          volume: '100',
          amount: (Number(close) * 100).toFixed(4),
          provider: 't13-performance-fixture',
          providerRevision: '2026-09-09',
        });
        sequence += 1;
      }
    }
  }
  return bars;
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const measure = async <T>(operation: () => Promise<T> | T) => {
  const start = performance.now();
  const value = await operation();
  return { value, elapsedMs: Number((performance.now() - start).toFixed(3)) };
};

const main = async () => {
  const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-backtest-v2-t13-'));
  try {
    const bars = [
      ...buildBars('CN', '600519.SH', 10),
      ...buildBars('HK', '00005.HK', 10),
      ...buildBars('US', 'AAPL.US', 10),
    ];
    const byMarket = new Map<TradingMarket, BenchmarkBar[]>();
    for (const bar of bars) byMarket.set(bar.market, [...(byMarket.get(bar.market) ?? []), bar]);
    const aggregate = await measure(() =>
      [...byMarket.entries()].flatMap(([market, marketBars]) =>
        aggregateMinuteBars(marketBars, '5m', { calendar: tradingCalendars[market] }),
      ),
    );
    const artifactStore = new LocalArtifactStore(root);
    const put = await measure(() => artifactStore.put({ key: 't13/bars.parquet', rows: bars }));
    const read = await measure(async () => {
      const rows: Record<string, string | number | boolean | null>[] = [];
      for await (const row of await artifactStore.openRead(put.value, {
        columns: ['symbol', 'occurredAt', 'close'],
      })) {
        rows.push(row);
      }
      return rows;
    });
    const points = bars
      .filter((bar) => bar.market === 'CN')
      .map((bar) => ({
        occurredAt: bar.occurredAt,
        availableAt: bar.availableAt,
        value: bar.close,
      }));
    const indicator = await measure(() => evaluateIndicator('MA', points, { period: 50 }));
    const events = bars.map((bar, index) => ({
      occurredAt: bar.occurredAt,
      phase: index % 11,
      sequence: index,
    }));
    const eventIteration = await measure(() =>
      [...events].sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.phase - right.phase ||
          left.sequence - right.sequence,
      ),
    );
    const functionalDigest = digest({
      aggregate: aggregate.value.map((bar) => ({
        ...bar,
        provider: undefined,
        providerRevision: undefined,
      })),
      indicator: indicator.value.points,
      artifactRows: read.value,
    });
    const rss = process.memoryUsage().rss;
    console.log(
      JSON.stringify({
        gate: 'backtest-v2-performance-spike',
        status: 'passed',
        fixture: { markets: ['CN', 'HK', 'US'], tradingDays: 10, minuteBars: bars.length },
        measurements: {
          aggregation5m: { bars: aggregate.value.length, elapsedMs: aggregate.elapsedMs },
          artifactWrite: { bytes: put.value.sizeBytes, elapsedMs: put.elapsedMs },
          artifactRead: { rows: read.value.length, elapsedMs: read.elapsedMs },
          indicatorMA50: { points: indicator.value.points.length, elapsedMs: indicator.elapsedMs },
          eventIteration: {
            events: eventIteration.value.length,
            elapsedMs: eventIteration.elapsedMs,
          },
          runnerWorkloadPeakRssBytes: rss,
        },
        functionalDigest,
        note: '本 spike 测量冻结 Artifact、聚合、Indicator 和事件迭代；Runner 峰值 RSS 使用同一进程 workload 近似，不替代真实 Worker/Docker 验收。',
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
