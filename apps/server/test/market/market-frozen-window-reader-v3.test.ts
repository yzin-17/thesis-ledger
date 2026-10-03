import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  marketFrozenWindowRefV3Schema,
} from '@thesis-ledger/schemas';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import { MarketFrozenWindowReaderV3 } from '../../src/market/market-frozen-window-reader-v3.js';
import { MarketBarWindowReaderV3 } from '../../src/market/market-bar-reader-v3.js';
import { marketWindowSeriesVersionV3 } from '../../src/market/market-frozen-window-v3.js';
import { createBacktestSnapshotV3Source } from '../../src/backtest/backtest-snapshot-v3-source.js';
import { decodeMarketWindowEvidenceInsert } from './market-window-evidence-v3-sql-mock.js';

const json = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const fixture = async (requestWindowBasis = false, multiWindow = false) => {
  const parsed = marketDataBarSeriesRequestV3Schema.parse(
    json('market-data-v3.request.etf-qfq.json'),
  );
  const request = {
    ...parsed,
    routeTarget: {
      providerId: 'hithink',
      upstreamSource: 'hithink-financial-api',
      routeIndex: 0 as const,
    },
  };
  let response = marketDataBarSeriesResponseV3Schema.parse(
    json('market-data-v3.response.etf-qfq.json'),
  );
  if (multiWindow) {
    const golden = json('market-data-v3.multi-window-hash.json');
    response = golden.response;
    response.inputFingerprint = golden.expectedContentHash;
    response.sourcePriceBasis.revision = {
      origin: 'local-observation',
      contentHash: golden.expectedContentHash,
    };
  }
  if (requestWindowBasis) response.sourcePriceBasis.basisScope = 'request-window';
  const rows = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const id = String(data.identityFingerprint);
    if (rows.has(id)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    rows.set(id, data);
    return data;
  });
  const findUnique = vi.fn(
    async ({ where }: { where: { identityFingerprint: string } }) =>
      rows.get(where.identityFingerprint) ?? null,
  );
  const repository = new MarketWindowEvidenceV3Repository({
    marketBarWindowEvidenceV3: { create, findUnique },
    $queryRaw: vi.fn(async (statement: Prisma.Sql) => {
      try {
        return [await create({ data: decodeMarketWindowEvidenceInsert(statement) })];
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'P2002'
        )
          return [];
        throw error;
      }
    }),
  } as never);
  const stored = await repository.record({
    request,
    response,
    seriesVersion: marketWindowSeriesVersionV3(request, response),
    desiredRevision: 4,
    effectivePolicyRevision: response.provenance.effectivePolicyRevision,
    catalogRevision: 9,
  });
  const frozen = (await repository.findFrozen(stored.identityFingerprint))!;
  const reference = marketFrozenWindowRefV3Schema.parse({
    version: 'market-frozen-window-v1',
    identityFingerprint: stored.identityFingerprint,
    responseHash: frozen.completeResponseHash,
  });
  const revisions = {
    readCurrent: vi.fn().mockResolvedValue({
      desiredRevision: 4,
      effectiveRevision: response.provenance.effectivePolicyRevision,
      catalogRevision: 9,
      targetSources: [request.routeTarget],
      availability: [{ eligible: true, catalogReady: true }],
    }),
  };
  const fixed = new MarketFrozenWindowReaderV3(repository, revisions as never);
  const dsa = {
    marketBarsV3: vi.fn(),
    marketRouteCatalogV3: vi.fn(),
    effectiveControlPolicyV3: vi.fn(),
  };
  const reader = new MarketBarWindowReaderV3(
    { getPolicy: vi.fn() } as never,
    dsa as never,
    repository,
    fixed,
  );
  const input = {
    market: request.routeKey.market,
    symbol: request.symbol,
    routeKey: request.routeKey,
    window: { start: request.start, end: request.end },
    frozenWindowRef: reference,
  };
  return { response, reference, input, reader, revisions, repository, rows, create, dsa };
};

describe('固定Market窗口与子窗读取', () => {
  it('多窗口整窗复用保留观测，不请求行情，也不把窗口基准裁剪成新原生窗口', async () => {
    const f = await fixture(false, true);
    const result = await f.reader.read(f.input);
    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.selection.response).toEqual({ ...f.response, requestId: expect.any(String) });
    const artifacts = createBacktestSnapshotV3Source(
      {
        purpose: 'execution',
        symbol: f.input.symbol,
        routeKey: f.input.routeKey,
        window: f.input.window,
      },
      result,
    );
    expect(JSON.parse(String(artifacts.evidenceRow.multiWindowResponse))).toEqual(
      result.selection.response,
    );
    expect(f.dsa.marketBarsV3).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
    const cropped = await f.reader.read({
      ...f.input,
      window: { ...f.input.window, start: '2026-05-19' },
    });
    expect(cropped.status).toBe('unavailable');
    expect(f.dsa.marketBarsV3).not.toHaveBeenCalled();
  });
  it('完整窗口复用已校验的持久化响应，不访问线上行情', async () => {
    const f = await fixture();
    const result = await f.reader.read(f.input);
    expect(result).toMatchObject({
      status: 'selected',
      frozenWindowRef: f.reference,
      selection: {
        response: { bars: f.response.bars, sourcePriceBasis: f.response.sourcePriceBasis },
      },
    });
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.dsa.marketBarsV3).not.toHaveBeenCalled();
    expect(f.dsa.marketRouteCatalogV3).not.toHaveBeenCalled();
  });
  it('子窗只裁剪已冻结事实，保留价格基准、父引用与可验证的独立证据', async () => {
    const f = await fixture();
    const result = await f.reader.read({
      ...f.input,
      window: { start: '2026-05-19', end: '2026-05-20' },
    });
    expect(result.status).toBe('selected');
    if (result.status !== 'selected') throw new Error('fixture');
    expect(result.selection.response.bars).toEqual(f.response.bars.slice(1));
    expect(result.selection.response.sourcePriceBasis).toEqual(f.response.sourcePriceBasis);
    expect(result.selection.response.coverageProof.calendar.expectedSessionDates).toEqual([
      '2026-05-19',
      '2026-05-20',
    ]);
    expect(result.selection.response.inputFingerprint).toMatch(/^frozen-window-view-v1:/);
    expect(result.frozenWindowRef).toEqual(f.reference);
    const stored = await f.repository.findFrozen(result.evidence.identityFingerprint);
    expect(stored?.response).toEqual(result.selection.response);
    expect(f.rows.size).toBe(2);
    expect(f.dsa.marketBarsV3).not.toHaveBeenCalled();
  });
  it.each(['missing', 'hash', 'symbol', 'range', 'warmup'])(
    '错误引用或范围不转向线上重取：%s',
    async (kind) => {
      const f = await fixture();
      const input = structuredClone(f.input);
      if (kind === 'missing') input.frozenWindowRef.identityFingerprint = '0'.repeat(64);
      else if (kind === 'hash') input.frozenWindowRef.responseHash = '0'.repeat(64);
      else if (kind === 'symbol') input.symbol = 'other';
      else if (kind === 'range') input.window.start = '2026-05-01';
      const result = await f.reader.read({
        ...input,
        ...(kind === 'warmup'
          ? { warmup: { analysisStart: '2026-05-19', minimumSessions: 5 } }
          : {}),
      });
      expect(result.status).toBe('unavailable');
      expect(f.dsa.marketBarsV3).not.toHaveBeenCalled();
      expect(f.rows.size).toBe(1);
    },
  );
  it('当前路由修订变化后不能为新Run复用旧配置', async () => {
    const f = await fixture();
    f.revisions.readCurrent.mockResolvedValue({
      ...(await f.revisions.readCurrent()),
      desiredRevision: 5,
    });
    expect(await f.reader.read(f.input)).toMatchObject({
      status: 'unavailable',
      selection: { reason: 'policy_mismatch' },
    });
    expect(f.dsa.marketBarsV3).not.toHaveBeenCalled();
  });
  it('request-window基准只可读取原完整窗口', async () => {
    const f = await fixture(true);
    expect((await f.reader.read(f.input)).status).toBe('selected');
    expect(
      (await f.reader.read({ ...f.input, window: { start: '2026-05-19', end: '2026-05-20' } }))
        .status,
    ).toBe('unavailable');
  });
});
