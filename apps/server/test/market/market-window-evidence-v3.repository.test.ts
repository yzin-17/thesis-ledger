import { readFileSync } from 'node:fs';
import { Prisma, type MarketBarWindowEvidenceV3 as PrismaEvidenceV3 } from '@prisma/client';
import type {
  MarketDataBarSeriesRequestV3,
  MarketDataBarSeriesResponseV3,
  MarketDataMultiWindowResponseV3,
} from '@thesis-ledger/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import {
  MarketWindowEvidenceV3IdentityConflictError,
  MarketWindowEvidenceV3Repository,
  type PinnedMarketWindowRequestV3,
} from '../../src/market/market-window-evidence-v3.repository.js';
import { createMarketSeriesIdentity } from '../../src/market/market-series-identity.js';
import {
  marketFrozenWindowHashV3,
  marketWindowSeriesVersionV3,
} from '../../src/market/market-frozen-window-v3.js';
import { decodeMarketWindowEvidenceInsert } from './market-window-evidence-v3-sql-mock.js';

const readFixture = <T>(fileName: string): T =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../packages/schemas/fixtures/${fileName}`, import.meta.url),
      'utf8',
    ),
  ) as T;

const requestFixture = readFixture<MarketDataBarSeriesRequestV3>(
  'market-data-v3.request.etf-qfq.json',
);
const responseFixture = readFixture<MarketDataBarSeriesResponseV3>(
  'market-data-v3.response.etf-qfq.json',
);

const makeInput = () => {
  const request = structuredClone(requestFixture) as PinnedMarketWindowRequestV3;
  request.routeTarget = {
    providerId: 'hithink',
    upstreamSource: 'hithink-financial-api',
    routeIndex: 0,
  };
  const response = structuredClone(responseFixture);
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
  return {
    request,
    response,
    seriesVersion,
    desiredRevision: 4,
    effectivePolicyRevision: response.provenance.effectivePolicyRevision,
    catalogRevision: 9,
    fetchedAt: new Date('2026-05-20T07:02:00.000Z'),
  };
};

const createStoredRow = (data: Record<string, unknown>): PrismaEvidenceV3 =>
  ({ ...data }) as unknown as PrismaEvidenceV3;

const createRepository = (options?: {
  initialRows?: PrismaEvidenceV3[];
  createOverride?: (data: Record<string, unknown>) => Promise<PrismaEvidenceV3>;
}) => {
  const rows = new Map((options?.initialRows ?? []).map((row) => [row.identityFingerprint, row]));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (options?.createOverride) return options.createOverride(data);
    const row = createStoredRow(data);
    if (rows.has(row.identityFingerprint)) {
      throw Object.assign(new Error('unique conflict'), { code: 'P2002' });
    }
    rows.set(row.identityFingerprint, row);
    return row;
  });
  const findUnique = vi.fn(
    async ({ where }: { where: { identityFingerprint: string } }) =>
      rows.get(where.identityFingerprint) ?? null,
  );
  const queryRaw = vi.fn(async (statement: Prisma.Sql) => {
    const data = decodeMarketWindowEvidenceInsert(statement);
    try {
      return [await create({ data })];
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002')
        return [];
      throw error;
    }
  });
  const prisma = {
    marketBarWindowEvidenceV3: { create, findUnique, updateMany: vi.fn() },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const updateMany = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { identityFingerprint: string };
      data: Record<string, unknown>;
    }) => {
      const row = rows.get(where.identityFingerprint);
      if (!row || row.completeResponse !== null || row.completeResponseHash !== null)
        return { count: 0 };
      rows.set(where.identityFingerprint, createStoredRow({ ...row, ...data }));
      return { count: 1 };
    },
  );
  prisma.marketBarWindowEvidenceV3.updateMany = updateMany as never;
  prisma.$executeRaw = vi.fn(async (statement: Prisma.Sql) => {
    const [responseText, completeResponseHash, identityFingerprint] = statement.values;
    const result = await updateMany({
      where: {
        identityFingerprint: identityFingerprint as string,
        completeResponse: { equals: Prisma.DbNull },
        completeResponseHash: null,
      } as never,
      data: {
        completeResponse: JSON.parse(responseText as string),
        completeResponseHash,
      },
    });
    return result.count;
  }) as never;
  return {
    repository: new MarketWindowEvidenceV3Repository(prisma),
    create,
    findUnique,
    updateMany,
    rows,
  };
};

describe('MarketWindowEvidenceV3Repository', () => {
  it('多窗口完整写入并离线读回，改写子观测后拒绝', async () => {
    const golden = readFixture<{
      response: MarketDataMultiWindowResponseV3;
      expectedContentHash: string;
    }>('market-data-v3.multi-window-hash.json');
    const response = golden.response;
    response.inputFingerprint = golden.expectedContentHash;
    response.sourcePriceBasis.revision = {
      origin: 'local-observation',
      contentHash: golden.expectedContentHash,
    };
    const input = makeInput();
    input.response = response;
    input.seriesVersion = marketWindowSeriesVersionV3(input.request, response);
    const f = createRepository();
    const stored = await f.repository.record(input);
    const loaded = await f.repository.findFrozen(stored.identityFingerprint);
    expect(loaded?.response).toEqual(response);
    expect(loaded?.completeResponseHash).toBe(marketFrozenWindowHashV3(response));
    const row = f.rows.get(stored.identityFingerprint)!;
    const changed = structuredClone(response);
    changed.windowObservations[0]!.completedAt = '2026-05-20T07:03:00Z';
    row.completeResponse = JSON.parse(JSON.stringify(changed));
    await expect(f.repository.findFrozen(stored.identityFingerprint)).rejects.toThrow();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('记录严格关联的 pinned V3 响应及精确窗口证据', async () => {
    const input = makeInput();
    const { repository, create } = createRepository();

    const stored = await repository.record(input);
    const data = create.mock.calls[0]![0].data;

    expect(stored).toMatchObject({
      routeKey: input.request.routeKey,
      target: input.request.routeTarget,
      symbol: input.request.symbol,
      window: { start: input.request.start, end: input.request.end },
      seriesVersion: input.seriesVersion,
      inputFingerprint: input.response.inputFingerprint,
      desiredRevision: input.desiredRevision,
      effectivePolicyRevision: input.effectivePolicyRevision,
      catalogRevision: input.catalogRevision,
      sourcePriceBasis: input.response.sourcePriceBasis,
      coverageProof: input.response.coverageProof,
    });
    expect(data).toMatchObject({
      routeKind: 'bar',
      market: 'CN',
      assetType: 'ETF',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
      providerId: 'hithink',
      upstreamSource: 'hithink-financial-api',
      routeIndex: 0,
      requestedStart: new Date('2026-05-18T00:00:00.000Z'),
      requestedEnd: new Date('2026-05-20T00:00:00.000Z'),
      inputFingerprint: input.response.inputFingerprint,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('Catalog 安全整数超过 32 位时精确存储并离线读回', async () => {
    const input = makeInput();
    input.catalogRevision = 4_135_056_022_866_140;
    const f = createRepository();
    const stored = await f.repository.record(input);
    const row = f.rows.get(stored.identityFingerprint);
    expect(row?.catalogRevision).toBe(4_135_056_022_866_140n);
    expect(stored.catalogRevision).toBe(input.catalogRevision);
    const frozen = await f.repository.findFrozen(stored.identityFingerprint);
    expect(frozen?.evidence.catalogRevision).toBe(input.catalogRevision);
  });

  it('按身份读取完整冻结行情并复核载荷哈希，缺失窗口不在线补齐', async () => {
    const f = createRepository();
    const input = makeInput();
    const stored = await f.repository.record(input);
    const frozen = await f.repository.findFrozen(stored.identityFingerprint);
    expect(frozen).toMatchObject({
      request: input.request,
      response: input.response,
      seriesVersion: input.seriesVersion,
      completeResponseHash: marketFrozenWindowHashV3(input.response),
    });
    expect(frozen?.evidence).toEqual(stored);
    expect(await f.repository.findFrozen('0'.repeat(64))).toBeNull();
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('请求关联ID不改变市场载荷身份，但新请求也不能覆盖旧载荷', async () => {
    const f = createRepository();
    const input = makeInput();
    const stored = await f.repository.record(input);
    const repeated = structuredClone(input);
    repeated.request.requestId = 'another-request';
    repeated.response.requestId = 'another-request';
    expect(marketFrozenWindowHashV3(repeated.response)).toBe(
      marketFrozenWindowHashV3(input.response),
    );
    await f.repository.record(repeated);
    expect((await f.repository.findFrozen(stored.identityFingerprint))?.response.requestId).toBe(
      input.response.requestId,
    );
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('旧证据没有完整载荷时返回缺失，只能由同身份新响应原子填充', async () => {
    const f = createRepository();
    const input = makeInput();
    const stored = await f.repository.record(input);
    const row = f.rows.get(stored.identityFingerprint)!;
    f.rows.set(stored.identityFingerprint, {
      ...row,
      completeResponse: null,
      completeResponseHash: null,
    });
    expect(await f.repository.findFrozen(stored.identityFingerprint)).toBeNull();
    expect(f.updateMany).not.toHaveBeenCalled();
    await f.repository.record(input);
    expect(f.updateMany).toHaveBeenCalledOnce();
    expect(f.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          identityFingerprint: stored.identityFingerprint,
          completeResponseHash: null,
          completeResponse: expect.any(Object),
        }),
      }),
    );
    expect((await f.repository.findFrozen(stored.identityFingerprint))?.response).toEqual(
      input.response,
    );
  });

  it('填充期间竞争得到不一致载荷时拒绝，不覆盖竞争写入', async () => {
    const f = createRepository();
    const input = makeInput();
    const stored = await f.repository.record(input);
    const row = f.rows.get(stored.identityFingerprint)!;
    f.rows.set(stored.identityFingerprint, {
      ...row,
      completeResponse: null,
      completeResponseHash: null,
    });
    f.updateMany.mockImplementationOnce(async () => {
      f.rows.set(stored.identityFingerprint, { ...row, completeResponseHash: '0'.repeat(64) });
      return { count: 0 };
    });
    await expect(f.repository.record(input)).rejects.toBeInstanceOf(
      MarketWindowEvidenceV3IdentityConflictError,
    );
    expect(f.rows.get(stored.identityFingerprint)?.completeResponseHash).toBe('0'.repeat(64));
  });

  it.each(['payload', 'hash', 'series', 'identity', 'effective', 'bars'])(
    '损坏或错配不可作为冻结行情：%s',
    async (field) => {
      const f = createRepository();
      const input = makeInput();
      const stored = await f.repository.record(input);
      const row = f.rows.get(stored.identityFingerprint)!;
      if (field === 'payload')
        row.completeResponse = {
          ...input.response,
          coverage: {
            ...input.response.coverage,
            hasMoreBefore: !input.response.coverage.hasMoreBefore,
          },
        };
      else if (field === 'hash') row.completeResponseHash = '0'.repeat(64);
      else if (field === 'series') row.seriesVersion = 'forged-series';
      else if (field === 'identity') row.desiredRevision += 1;
      else {
        const response = structuredClone(input.response);
        if (field === 'effective') response.provenance.effectivePolicyRevision += 1;
        else response.bars[0]!.volume = 999999;
        row.completeResponse = response;
        row.completeResponseHash = marketFrozenWindowHashV3(response);
      }
      await expect(f.repository.findFrozen(stored.identityFingerprint)).rejects.toThrow();
    },
  );

  it('相同身份与相同证明重复记录时幂等，不更新已有行', async () => {
    const input = makeInput();
    const { repository, create, findUnique, rows } = createRepository();

    const first = await repository.record(input);
    const second = await repository.record({
      ...input,
      fetchedAt: new Date('2026-05-21T00:00:00.000Z'),
    });

    expect(second.identityFingerprint).toBe(first.identityFingerprint);
    expect(rows.size).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('同一身份出现不同 coverage proof 时拒绝覆盖', async () => {
    const input = makeInput();
    const { repository, rows } = createRepository();
    const first = await repository.record(input);
    const conflicting = makeInput();
    conflicting.response.coverageProof.calendar.revision = 'changed-calendar-revision';

    await expect(repository.record(conflicting)).rejects.toBeInstanceOf(
      MarketWindowEvidenceV3IdentityConflictError,
    );
    expect(rows.get(first.identityFingerprint)?.coverageProof).toEqual(
      input.response.coverageProof,
    );
  });

  it('拒绝未固定目标、来源不匹配、窗口错位和伪造的序列版本', async () => {
    const { repository, create } = createRepository();
    const unpinned = makeInput();
    delete (unpinned.request as Partial<PinnedMarketWindowRequestV3>).routeTarget;
    await expect(repository.record(unpinned)).rejects.toThrow('必须使用固定 RouteTarget');

    const wrongTarget = makeInput();
    wrongTarget.response.provenance.providerId = 'other-provider';
    await expect(repository.record(wrongTarget)).rejects.toThrow();

    const wrongWindow = makeInput();
    wrongWindow.request.start = '2026-05-19';
    await expect(repository.record(wrongWindow)).rejects.toThrow('完全一致');

    const wrongSeries = makeInput();
    wrongSeries.seriesVersion = 'market-series-v1:identified:forged';
    await expect(repository.record(wrongSeries)).rejects.toThrow('seriesVersion');
    expect(create).not.toHaveBeenCalled();
  });

  it('Effective revision 不匹配时拒绝保存', async () => {
    const input = makeInput();
    const { repository, create } = createRepository();

    await expect(
      repository.record({ ...input, effectivePolicyRevision: input.effectivePolicyRevision + 1 }),
    ).rejects.toThrow('Effective revision');
    expect(create).not.toHaveBeenCalled();
  });

  it('只按完整证据身份读取，窗口或 response fingerprint 改变即 miss', async () => {
    const input = makeInput();
    const { repository, findUnique } = createRepository();
    const stored = await repository.record(input);
    const identity = {
      request: input.request,
      seriesVersion: input.seriesVersion,
      inputFingerprint: input.response.inputFingerprint,
      desiredRevision: input.desiredRevision,
      effectivePolicyRevision: input.effectivePolicyRevision,
      catalogRevision: input.catalogRevision,
    };

    await expect(repository.findExact(identity)).resolves.toMatchObject({
      identityFingerprint: stored.identityFingerprint,
      coverageProof: input.response.coverageProof,
    });
    const exactLookup = findUnique.mock.calls[0]![0];
    await expect(
      repository.findExact({ ...identity, inputFingerprint: 'different-response-fingerprint' }),
    ).resolves.toBeNull();
    expect(findUnique).toHaveBeenLastCalledWith({
      where: {
        identityFingerprint: expect.not.stringMatching(exactLookup.where.identityFingerprint),
      },
    });
  });
});
