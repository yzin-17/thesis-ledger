import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  detectScreenshotSource,
  ImportService,
  validateVisionPosition,
} from '../../src/imports/import.service.js';
import { matchesSignature } from '../../src/imports/import.controller.js';
import { AssetMatcherService } from '../../src/imports/asset-matcher.service.js';
import { ImportCommitService } from '../../src/imports/import-commit.service.js';
import { ImportDraftService } from '../../src/imports/import-draft.service.js';
import { ImportRollbackService } from '../../src/imports/import-rollback.service.js';

describe('截图导入', () => {
  it('Ground Truth fixture 覆盖三类来源且字段可回归', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/screenshot-ground-truth.json', import.meta.url), 'utf8'),
    ) as Array<{ source: string; symbol: string; quantity: number; costPrice: number }>;
    expect(fixture).toHaveLength(15);
    expect(new Set(fixture.map((item) => item.source))).toEqual(
      new Set(['alipay', 'ths', 'broker']),
    );
    expect(fixture.every((item) => item.symbol && item.quantity > 0 && item.costPrice >= 0)).toBe(
      true,
    );
  });
  it.each([
    ['支付宝持仓', 'alipay'],
    ['同花顺资产', 'ths'],
    ['某某证券', 'broker'],
    ['无法识别', 'unknown'],
  ] as const)('识别来源 %s', (text, source) => expect(detectScreenshotSource(text)).toBe(source));
  it('标记数值差异和低置信度', () =>
    expect(
      validateVisionPosition({
        quantity: '100',
        costPrice: '10',
        marketPrice: '10',
        marketValue: '3000',
        confidence: 0.5,
      }),
    ).toEqual(['市值与数量、市场价不一致', '识别置信度较低']));
  it('保留缺失字段并检查市场价、盈亏和盈亏比例', () =>
    expect(
      validateVisionPosition({
        quantity: '100',
        costPrice: '10',
        marketPrice: '12',
        marketValue: '1000',
        profit: '50',
        profitRate: '0.5',
        confidence: 1,
      }),
    ).toEqual(['市值与数量、市场价不一致', '盈亏与数量、成本价、市场价不一致', '盈亏比例不一致']));
  it('根据文件内容识别 PNG、JPEG、WebP 并拒绝伪装内容', () => {
    expect(matchesSignature(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(
      true,
    );
    expect(matchesSignature(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg')).toBe(true);
    expect(matchesSignature(Buffer.from('RIFFxxxxWEBP'), 'image/webp')).toBe(true);
    expect(matchesSignature(Buffer.from('not-an-image'), 'image/png')).toBe(false);
  });
  it('Vision Provider 可替换并通过 Mock 创建草稿', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const revisionCreate = vi.fn(async ({ data }: { data: object }) => data);
    const prisma = {
      $transaction: (operation: (client: unknown) => unknown) => operation(prisma),
      importDraft: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
      importDraftRevision: {
        create: revisionCreate,
      },
      asset: {
        findUnique: vi.fn(async () => ({ symbol: '600519.SH' })),
        findMany: vi.fn(),
      },
      position: { findMany: vi.fn(async () => []) },
    };
    const provider = {
      id: 'mock',
      extract: vi.fn(async () => [
        { symbol: '600519', quantity: '100', costPrice: '10', confidence: 1, rawText: {} },
      ]),
    };
    const matcher = new AssetMatcherService(prisma as never);
    const drafts = new ImportDraftService(prisma as never, matcher);
    const draft = await new ImportService(
      matcher,
      drafts,
      {} as never,
      {} as never,
    ).createDraftFromProvider(accountId, Buffer.from('image'), 'unknown', provider, 0.4);
    expect(provider.extract).toHaveBeenCalledOnce();
    expect(draft).toMatchObject({ source: 'unknown', sourceConfidence: 0.4, status: 'pending' });
    const revisionData = revisionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(revisionData.data).not.toHaveProperty('observedAt');
    expect(revisionData.data).not.toHaveProperty('capturedAt');
  });
  it('资产匹配明确区分 matched、ambiguous 和 unmatched', async () => {
    const prisma = {
      asset: {
        findUnique: vi.fn(async () => null),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { symbol: '510300.SH', name: '沪深300' },
            { symbol: '159919.SZ', name: '沪深300' },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new ImportService(
      new AssetMatcherService(prisma as never),
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.matchAsset({ name: '沪深300', confidence: 1 })).resolves.toMatchObject({
      status: 'ambiguous',
      candidates: ['510300.SH', '159919.SZ'],
    });
    await expect(service.matchAsset({ name: '不存在', confidence: 1 })).resolves.toMatchObject({
      status: 'unmatched',
    });
  });
  it('同一账户重复截图返回已有草稿且不写持仓', async () => {
    const existing = { id: 'existing', status: 'pending' };
    const prisma = {
      importDraft: { findUnique: vi.fn(async () => existing), create: vi.fn() },
      position: { upsert: vi.fn() },
      asset: { upsert: vi.fn() },
    };
    const matcher = new AssetMatcherService(prisma as never);
    const drafts = new ImportDraftService(prisma as never, matcher);
    await expect(
      new ImportService(matcher, drafts, {} as never, {} as never).createDraft(
        '11111111-1111-4111-8111-111111111111',
        Buffer.from('same-image'),
        'alipay',
        [],
      ),
    ).resolves.toBe(existing);
    expect(prisma.importDraft.create).not.toHaveBeenCalled();
    expect(prisma.position.upsert).not.toHaveBeenCalled();
  });
  it('提交幂等，已提交草稿不会重复写持仓', async () => {
    const commitReviewedImport = vi.fn(async () => ({ status: 'committed' }));
    const commits = new ImportCommitService({ commitReviewedImport } as never);
    await new ImportService({} as never, {} as never, commits, {} as never).commit('draft', []);
    expect(commitReviewedImport).toHaveBeenCalledOnce();
  });
  it('截图提交委托给原子导入入口，而不是直接写 Position', async () => {
    const draftId = '11111111-1111-4111-8111-111111111114';
    const baselineImport = {
      commitReviewedImport: vi.fn(async () => ({ id: draftId, status: 'committed' })),
    };
    const commits = new ImportCommitService(baselineImport as never);
    const rows = [
      {
        rawSymbol: '600519.SH',
        symbol: '600519.SH',
        matchStatus: 'matched',
        matchCandidates: ['600519.SH'],
        quantity: '100',
        costPrice: '10',
        confidence: 1,
        rawText: {},
        issues: [],
      },
    ];
    await new ImportService({} as never, {} as never, commits, {} as never).commit(draftId, rows);
    expect(baselineImport.commitReviewedImport).toHaveBeenCalledWith(
      draftId,
      rows,
      undefined,
      undefined,
    );
  });
  it('回滚恢复导入前持仓并保留历史状态', async () => {
    const draftId = '11111111-1111-4111-8111-111111111113';
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId: '11111111-1111-4111-8111-111111111111',
          status: 'committed',
          committedAt: new Date('2026-08-26T01:00:00.000Z'),
          rows: [{ symbol: '600519.SH' }],
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      ledgerEvent: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [
          {
            id: '22222222-2222-4222-8222-222222222222',
            accountId: '11111111-1111-4111-8111-111111111111',
            type: 'POSITION_BASELINE_OBSERVATION',
            occurredAt: new Date('2026-08-26T00:59:00.000Z'),
            factId: '33333333-3333-4333-8333-333333333333',
            ledgerRevision: 1n,
            timePrecision: 'INSTANT',
            sourceTimezone: 'UTC',
            economicOrderKey: 'draft:000000',
            recordedAt: new Date('2026-08-26T01:00:00.000Z'),
            payloadVersion: 1,
            payload: {
              symbol: '600519.SH',
              batchId: '44444444-4444-4444-8444-444444444444',
              batchScope: 'PARTIAL',
              quantity: '100',
              averageCost: '10',
              currency: 'CNY',
              costIncludesFees: 'UNKNOWN',
            },
            sourceCategory: 'IMPORT',
            sourceChannel: 'screenshot',
            externalId: `draft:${draftId}:1:row-1`,
            sourceRowId: 'row-1',
            actorId: 'user-1',
            revisionAction: 'CREATE',
            supersedesEventId: null,
            reason: null,
          },
        ]),
      },
      position: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    const appendRevision = vi.fn(async (_context: object, event: object) => event);
    const repository = {
      withAccountWrite: async (
        accountId: string,
        operation: (context: object) => Promise<{ value: unknown; advanceRevision: boolean }>,
      ) => {
        const mutation = await operation({
          transaction: tx,
          accountId,
          currentLedgerRevision: 1n,
          nextLedgerRevision: 2n,
          currentProjectionGeneration: 1n,
          nextProjectionGeneration: 2n,
        });
        return { value: mutation.value, ledgerRevision: '2', projectionGeneration: '2' };
      },
      appendRevision,
    };
    await new ImportRollbackService(prisma as never, repository as never).rollback(draftId);
    expect(tx.ledgerEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ externalId: null }, { externalId: { not: { startsWith: `draft:${draftId}:` } } }],
        }),
      }),
    );
    expect(appendRevision).toHaveBeenCalledOnce();
    expect(appendRevision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        revisionAction: 'VOID',
        reason: '回滚截图导入',
        source: expect.objectContaining({ sourceRowId: 'row-1' }),
      }),
    );
    expect(tx.importDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
  });

  it('导入事实已被外部 VOID 修正时拒绝再次追加回滚 VOID', async () => {
    const draftId = '11111111-1111-4111-8111-111111111115';
    const original = {
      id: '22222222-2222-4222-8222-222222222223',
      accountId: '11111111-1111-4111-8111-111111111111',
      factId: '33333333-3333-4333-8333-333333333334',
    };
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId: original.accountId,
          status: 'committed',
          committedAt: new Date('2026-08-26T01:00:00.000Z'),
          rows: [{ symbol: '600519.SH' }],
        })),
        update: vi.fn(),
      },
      ledgerEvent: {
        findMany: vi.fn(async (args: { select?: unknown }) =>
          args.select
            ? [
                {
                  id: 'external-void',
                  factId: original.factId,
                  supersedesEventId: original.id,
                },
              ]
            : [original],
        ),
        findFirst: vi.fn(async () => null),
      },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    const appendRevision = vi.fn();
    const repository = {
      withAccountWrite: async (
        accountId: string,
        operation: (context: object) => Promise<unknown>,
      ) =>
        operation({
          transaction: tx,
          accountId,
          currentLedgerRevision: 1n,
          nextLedgerRevision: 2n,
          currentProjectionGeneration: 1n,
          nextProjectionGeneration: 2n,
        }),
      appendRevision,
    };

    await expect(
      new ImportRollbackService(prisma as never, repository as never).rollback(draftId),
    ).rejects.toThrow('导入事实已被其他修正');
    expect(appendRevision).not.toHaveBeenCalled();
    expect(tx.importDraft.update).not.toHaveBeenCalled();
  });
});
