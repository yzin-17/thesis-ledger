import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import {
  marketFrozenWindowHashV3,
  marketWindowSeriesVersionV3,
} from '../../src/market/market-frozen-window-v3.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';
import { makeMultiWindowResponseV3 } from './v3-multi-window-fixtures.js';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';

const databaseUrl = process.env.MULTI_WINDOW_TEST_DATABASE_URL;
const databaseName = process.env.MULTI_WINDOW_TEST_DATABASE_NAME;

(databaseUrl && databaseName ? it : it.skip)(
  '多窗口完整响应经真实证据仓库、Snapshot artifact 与离线重放保持原样',
  async () => {
    const url = new URL(databaseUrl!);
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.port === '5432' ||
      url.password ||
      !databaseName ||
      !/^d01_multiwindow_0928_[a-f0-9]{8}$/.test(databaseName) ||
      url.pathname !== `/${databaseName}` ||
      url.username !== databaseName
    ) {
      throw new Error('多窗口测试仅允许显式命名的本地隔离数据库');
    }
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    const root = await mkdtemp(join(tmpdir(), 'd01-multiwindow-pg-'));
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
        throw new Error('多窗口隔离数据库与 owner 身份核验失败');
      }
      const { input } = await buildInput();
      const baseline = await makeReaderResult({
        market: 'CN',
        symbol: '159516.SZ',
        routeKey: {
          kind: 'bar',
          market: 'CN',
          assetType: 'ETF',
          capability: 'DAILY_BAR',
          timeframe: '1d',
          adjustment: 'qfq',
        },
        window: { start: '2026-04-24', end: '2026-05-20' },
      });
      if (baseline.status !== 'selected') throw new Error('缺少多窗口基线');
      const response = makeMultiWindowResponseV3(baseline.selection.response);
      input.runConfig.executionPriceProtocol.priceBasis = {
        ...response.sourcePriceBasis,
        quantityBasis: 'normalized-units',
      };

      const repository = new MarketWindowEvidenceV3Repository(prisma as unknown as PrismaService);
      let frozenIdentity = '';
      const readV3 = async (request: MarketBarWindowReadInputV3) => {
        const selected = await makeReaderResult(request);
        if (selected.status !== 'selected') throw new Error('多窗口 Reader 未选择来源');
        expect(request.window).toEqual({
          start: response.coverage.requestedStart,
          end: response.coverage.requestedEnd,
        });
        response.requestId = selected.request.requestId;
        const seriesVersion = marketWindowSeriesVersionV3(selected.request, response);
        const stored = await repository.record({
          request: selected.request,
          response,
          seriesVersion,
          desiredRevision: selected.selection.desiredRevision,
          effectivePolicyRevision: response.provenance.effectivePolicyRevision,
          catalogRevision: selected.selection.catalogRevision,
        });
        frozenIdentity = stored.identityFingerprint;
        const frozen = await repository.findFrozen(frozenIdentity);
        expect(frozen?.response).toEqual(response);
        selected.seriesVersion = seriesVersion;
        selected.evidence = stored;
        selected.selection.response = frozen!.response;
        return selected;
      };
      const snapshots = new LocalSnapshotStore(root);
      const builder = new DsaSnapshotBuilder({} as never, snapshots, { readV3 } as never);
      const result = await builder.buildV3(input);
      expect(result.manifest.actualSources[0]?.windowProtocol).toBe(
        'market-multi-window-content-v1',
      );
      expect(await snapshots.v3.replay(input.runId)).toEqual(result.manifest);
      const artifact = result.artifactRefs.find((item) =>
        item.key.endsWith('/market-window-evidence-v3.parquet'),
      )!;
      const rows = [];
      for await (const row of await snapshots.artifacts.openRead(artifact)) rows.push(row);
      const saved = JSON.parse(String(rows[0]?.multiWindowResponse));
      expect(saved).toEqual(response);

      const damaged = structuredClone(response);
      damaged.windowObservations[0]!.completedAt = '2026-05-20T07:03:00Z';
      await prisma.marketBarWindowEvidenceV3.update({
        where: { identityFingerprint: frozenIdentity },
        data: { completeResponse: damaged },
      });
      await expect(repository.findFrozen(frozenIdentity)).rejects.toThrow();
      expect(await snapshots.v3.replay(input.runId)).toEqual(result.manifest);
      console.info(
        'D01_MULTIWINDOW_PG',
        JSON.stringify({
          responseHash: marketFrozenWindowHashV3(response),
          windowCount: response.windowObservations.length,
          barCount: response.bars.length,
          artifactRows: rows.length,
          tamperRejected: true,
        }),
      );
    } finally {
      await prisma.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
