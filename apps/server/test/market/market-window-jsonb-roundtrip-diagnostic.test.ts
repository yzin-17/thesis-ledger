import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
} from '@thesis-ledger/schemas';
import { expect, it } from 'vitest';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { createMarketSeriesIdentity } from '../../src/market/market-series-identity.js';
import {
  MarketWindowEvidenceV3Repository,
  type PinnedMarketWindowRequestV3,
} from '../../src/market/market-window-evidence-v3.repository.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';

const syntheticResponse = async () => {
  const fixture: unknown = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const base = marketDataBarSeriesResponseV3Schema.parse(fixture);
  const dates: string[] = [];
  for (let day = 18; day <= 36; day += 1) {
    const date = new Date(Date.UTC(2026, 4, day));
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      dates.push(date.toISOString().slice(0, 10));
    }
  }
  const start = dates[0]!;
  const end = dates.at(-1)!;
  const bars = dates.map((date, index) => {
    const close = 1 + index / 1000;
    return {
      timestamp: `${date}T07:00:00.000Z`,
      open: close - 0.001,
      high: close + 0.001,
      low: close - 0.002,
      close,
      volume: 1000 + index,
      amount: (1000 + index) * close,
      completionStatus: 'complete' as const,
      availableAt: `${date}T07:00:00.000Z`,
    };
  });
  return marketDataBarSeriesResponseV3Schema.parse({
    ...base,
    requestId: 'synthetic-snapshot-v3-request',
    bars,
    coverage: {
      requestedStart: start,
      requestedEnd: end,
      actualStart: bars[0]!.timestamp,
      actualEnd: bars.at(-1)!.timestamp,
      hasMoreBefore: false,
      latestCompleteTradingDate: end,
    },
    coverageProof: {
      ...base.coverageProof,
      calendar: { ...base.coverageProof.calendar, expectedSessionDates: dates },
      window: { status: 'complete', requestedStart: start, requestedEnd: end },
    },
    inputFingerprint: 'synthetic-complete-v3-execution-bars',
  });
};

const bits = (value: number) => {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(value);
  return buffer.toString('hex');
};

const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

type Difference = {
  path: string;
  originalType: string;
  returnedType: string;
  originalBits?: string;
  returnedBits?: string;
};

const differences = (original: unknown, returned: unknown) => {
  const result: Difference[] = [];
  const visit = (left: unknown, right: unknown, path: string) => {
    if (Object.is(left, right)) return;
    const originalType = typeOf(left);
    const returnedType = typeOf(right);
    if (originalType === 'number' && returnedType === 'number') {
      result.push({
        path,
        originalType,
        returnedType,
        originalBits: bits(left as number),
        returnedBits: bits(right as number),
      });
    } else if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        result.push({
          path: `${path}.length`,
          originalType: 'array-length',
          returnedType: 'array-length',
        });
      }
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        visit(left[index], right[index], `${path}[${index}]`);
      }
    } else if (originalType === 'object' && returnedType === 'object') {
      const leftObject = left as Record<string, unknown>;
      const rightObject = right as Record<string, unknown>;
      for (const key of new Set([...Object.keys(leftObject), ...Object.keys(rightObject)])) {
        if (Object.hasOwn(leftObject, key) !== Object.hasOwn(rightObject, key)) {
          result.push({
            path: `${path}.${key}`,
            originalType: Object.hasOwn(leftObject, key) ? typeOf(leftObject[key]) : 'missing',
            returnedType: Object.hasOwn(rightObject, key) ? typeOf(rightObject[key]) : 'missing',
          });
        } else {
          visit(leftObject[key], rightObject[key], `${path}.${key}`);
        }
      }
    } else {
      result.push({ path, originalType, returnedType });
    }
  };
  visit(original, returned, '$');
  return {
    numberDifferenceCount: result.filter((item) => item.originalBits !== undefined).length,
    otherDifferenceCount: result.filter((item) => item.originalBits === undefined).length,
    fields: result,
  };
};

it('合成完整 V3 响应在严格 Schema 与内存 JSON 往返中稳定', async () => {
  const original = await syntheticResponse();
  const returned: unknown = JSON.parse(JSON.stringify(original));
  const parsed = marketDataBarSeriesResponseV3Schema.parse(returned);
  const originalHash = marketFrozenWindowHashV3(original);
  const returnedHash = marketFrozenWindowHashV3(parsed);
  const comparison = differences(original, parsed);
  console.info('I01_JSONB_MEMORY', JSON.stringify({ originalHash, returnedHash, ...comparison }));
  expect(returnedHash).toBe(originalHash);
  expect(comparison.fields).toEqual([]);
});

const databaseUrl = process.env.DIAG_DATABASE_URL;
const databaseName = process.env.DIAG_DATABASE_NAME;

(databaseUrl && databaseName?.startsWith('i01_jsonb_orm_0928_') ? it : it.skip)(
  '隔离 PostgreSQL 经证据仓库 ORM 写入、回读与幂等记录诊断',
  async () => {
    const url = new URL(databaseUrl!);
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.port === '5432' ||
      url.password ||
      !databaseName ||
      !/^i01_jsonb_orm_0928_[a-f0-9]{8}$/.test(databaseName) ||
      url.pathname !== `/${databaseName}` ||
      url.username !== databaseName
    ) {
      throw new Error('ORM 诊断仅允许显式命名的本地隔离数据库');
    }
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    try {
      const identity = await prisma.$queryRaw<{ database: string; owner: string; user: string }[]>`
        SELECT current_database() AS database, current_user AS "user",
          pg_get_userbyid(datdba) AS owner
        FROM pg_database WHERE datname = current_database()
      `;
      if (
        identity.length !== 1 ||
        identity[0]!.database !== databaseName ||
        identity[0]!.owner !== databaseName ||
        identity[0]!.user !== databaseName
      ) {
        throw new Error('ORM 隔离数据库与 owner 身份核验失败');
      }
      const response = await syntheticResponse();
      const request = marketDataBarSeriesRequestV3Schema.parse({
        contractVersion: 3,
        requestId: response.requestId,
        symbol: response.symbol,
        routeKey: response.routeKey,
        routeTarget: {
          providerId: response.provenance.providerId,
          upstreamSource: response.provenance.upstreamSource,
          routeIndex: response.provenance.routeIndex,
        },
        start: response.coverage.requestedStart,
        end: response.coverage.requestedEnd,
      }) as PinnedMarketWindowRequestV3;
      const seriesVersion = createMarketSeriesIdentity({
        identity: {
          symbol: response.symbol,
          assetType: response.routeKey.assetType,
          timeframe: response.routeKey.timeframe,
          adjustment: response.routeKey.adjustment,
        },
        providerId: response.provenance.providerId,
        upstreamSource: response.provenance.upstreamSource,
        priceBasis: response.sourcePriceBasis,
        basisWindow: { start: request.start, end: request.end },
        points: response.bars,
      }).seriesVersion;
      const input = {
        request,
        response,
        seriesVersion,
        desiredRevision: 7,
        effectivePolicyRevision: response.provenance.effectivePolicyRevision,
        catalogRevision: 12,
        fetchedAt: new Date('2026-05-20T07:02:00.000Z'),
      };
      const repository = new MarketWindowEvidenceV3Repository(prisma as unknown as PrismaService);
      const stored = await repository.record(input);
      const row = await prisma.marketBarWindowEvidenceV3.findUniqueOrThrow({
        where: { identityFingerprint: stored.identityFingerprint },
      });
      const returned = marketDataBarSeriesResponseV3Schema.parse(row.completeResponse);
      const comparison = differences(response, row.completeResponse);
      const originalHash = marketFrozenWindowHashV3(response);
      const returnedHash = marketFrozenWindowHashV3(returned);
      console.info(
        'I01_JSONB_ORM',
        JSON.stringify({
          originalHash,
          storedHash: row.completeResponseHash,
          returnedHash,
          numberDifferenceCount: comparison.numberDifferenceCount,
          otherDifferenceCount: comparison.otherDifferenceCount,
          firstFields: comparison.fields.slice(0, 20),
        }),
      );
      expect(returnedHash).toBe(originalHash);
      expect(comparison.fields.length).toBe(0);
      const repeated = await repository.record(input);
      expect(repeated.identityFingerprint).toBe(stored.identityFingerprint);
      await prisma.marketBarWindowEvidenceV3.update({
        where: { identityFingerprint: stored.identityFingerprint },
        data: { completeResponse: Prisma.DbNull, completeResponseHash: null },
      });
      await repository.record(input);
      const restored = await prisma.marketBarWindowEvidenceV3.findUniqueOrThrow({
        where: { identityFingerprint: stored.identityFingerprint },
      });
      const restoredComparison = differences(response, restored.completeResponse);
      const restoredHash = marketFrozenWindowHashV3(restored.completeResponse);
      console.info(
        'I01_JSONB_ORM_BACKFILL',
        JSON.stringify({
          originalHash,
          storedHash: restored.completeResponseHash,
          restoredHash,
          numberDifferenceCount: restoredComparison.numberDifferenceCount,
          otherDifferenceCount: restoredComparison.otherDifferenceCount,
        }),
      );
      expect(restoredHash).toBe(originalHash);
      expect(restoredComparison.fields.length).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
  30_000,
);

(databaseUrl ? it : it.skip)(
  '一次隔离 PostgreSQL JSONB 原生与文本回读诊断',
  async () => {
    const url = new URL(databaseUrl!);
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.port === '5432' ||
      url.password ||
      !databaseName ||
      !/^i01_jsonb_diag_0928_[a-f0-9]{8}$/.test(databaseName) ||
      url.pathname !== `/${databaseName}` ||
      url.username !== databaseName
    ) {
      throw new Error('诊断仅允许本轮显式命名的本地隔离数据库');
    }
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    try {
      const identity = await prisma.$queryRaw<
        { database: string; owner: string; user: string; version: string }[]
      >`
      SELECT current_database() AS database, current_user AS "user",
        pg_get_userbyid(datdba) AS owner, current_setting('server_version') AS version
      FROM pg_database WHERE datname = current_database()
    `;
      if (
        identity.length !== 1 ||
        identity[0]!.database !== databaseName ||
        identity[0]!.owner !== databaseName ||
        identity[0]!.user !== databaseName
      ) {
        throw new Error('隔离数据库与 owner 身份核验失败');
      }
      const original = await syntheticResponse();
      // 同一个 SQL 参数、同一个 JSONB 值；本轮只执行一次此诊断 SELECT。
      const rows = await prisma.$queryRaw<{ native: unknown; text: string }[]>`
      WITH value AS (SELECT ${JSON.stringify(original)}::jsonb AS payload)
      SELECT payload AS native, payload::text AS text FROM value
    `;
      if (rows.length !== 1) throw new Error('诊断返回行数错误');
      const native = rows[0]!.native;
      const text: unknown = JSON.parse(rows[0]!.text);
      const parsedNative = marketDataBarSeriesResponseV3Schema.parse(native);
      const parsedText = marketDataBarSeriesResponseV3Schema.parse(text);
      console.info(
        'I01_JSONB_POSTGRES',
        JSON.stringify({
          diagnosticCalls: 1,
          prismaVersion: Prisma.prismaVersion,
          postgresVersion: identity[0]!.version,
          originalHash: marketFrozenWindowHashV3(original),
          nativeHash: marketFrozenWindowHashV3(parsedNative),
          textHash: marketFrozenWindowHashV3(parsedText),
          originalToNativeRaw: differences(original, native),
          originalToNativeParsed: differences(original, parsedNative),
          originalToTextRaw: differences(original, text),
          originalToTextParsed: differences(original, parsedText),
          nativeToText: differences(native, text),
        }),
      );
      // 成功仅表示采集完成；哈希失配不得成为业务 gate 通过结论。
    } finally {
      await prisma.$disconnect();
    }
  },
  20_000,
);
