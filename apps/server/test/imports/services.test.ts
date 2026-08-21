import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  detectScreenshotSource,
  ImportService,
  validateVisionPosition,
} from '../../src/imports/import.service.js';
import { matchesSignature } from '../../src/imports/import.controller.js';

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
        quantity: 100,
        costPrice: 10,
        marketPrice: 10,
        marketValue: 3000,
        confidence: 0.5,
      }),
    ).toEqual(['市值与数量、市场价不一致', '识别置信度较低']));
  it('保留缺失字段并检查市场价、盈亏和盈亏比例', () =>
    expect(
      validateVisionPosition({
        quantity: 100,
        costPrice: 10,
        marketPrice: 12,
        marketValue: 1000,
        profit: 50,
        profitRate: 0.5,
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
    const prisma = {
      importDraft: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: object }) => data),
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
        { symbol: '600519', quantity: 100, costPrice: 10, confidence: 1, rawText: {} },
      ]),
    };
    const draft = await new ImportService(prisma as never).createDraftFromProvider(
      accountId,
      Buffer.from('image'),
      'unknown',
      provider,
      0.4,
    );
    expect(provider.extract).toHaveBeenCalledOnce();
    expect(draft).toMatchObject({ source: 'unknown', sourceConfidence: 0.4, status: 'pending' });
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
    const service = new ImportService(prisma as never);
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
    await expect(
      new ImportService(prisma as never).createDraft(
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
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111112',
          accountId: '11111111-1111-4111-8111-111111111111',
          status: 'committed',
        })),
        update: vi.fn(),
      },
      position: { upsert: vi.fn() },
      asset: { upsert: vi.fn() },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    await new ImportService(prisma as never).commit('draft', []);
    expect(tx.position.upsert).not.toHaveBeenCalled();
    expect(tx.asset.upsert).not.toHaveBeenCalled();
  });
  it('截图提交写入可重放的 Ledger Adjustment，而不是直接写 Position', async () => {
    const draftId = '11111111-1111-4111-8111-111111111114';
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: draftId,
          accountId: '11111111-1111-4111-8111-111111111111',
          source: 'alipay',
          status: 'pending',
        })),
        update: vi.fn(async ({ data }: { data: object }) => ({
          id: draftId,
          accountId: '11111111-1111-4111-8111-111111111111',
          ...data,
        })),
      },
      position: { upsert: vi.fn() },
      asset: { upsert: vi.fn(async ({ create }: { create: object }) => create) },
      ledgerEvent: { upsert: vi.fn(async ({ create }: { create: object }) => create) },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    await new ImportService(prisma as never).commit(draftId, [
      {
        rawSymbol: '600519.SH',
        symbol: '600519.SH',
        matchStatus: 'matched',
        matchCandidates: ['600519.SH'],
        quantity: 100,
        costPrice: 10,
        confidence: 1,
        rawText: {},
        issues: [],
      },
    ]);
    expect(tx.position.upsert).not.toHaveBeenCalled();
    expect(tx.asset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { symbol: '600519.SH' } }),
    );
    expect(tx.ledgerEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'ADJUSTMENT',
          correctionOf: draftId,
          metadata: expect.objectContaining({ kind: 'opening-balance' }),
        }),
      }),
    );
  });
  it('回滚恢复导入前持仓并保留历史状态', async () => {
    const tx = {
      importDraft: {
        findUnique: vi.fn(async () => ({
          id: '11111111-1111-4111-8111-111111111113',
          accountId: '11111111-1111-4111-8111-111111111111',
          status: 'committed',
          rows: [{ symbol: '600519.SH' }],
          beforeState: [{ symbol: '600519.SH', quantity: 100, costPrice: 10 }],
        })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      position: { deleteMany: vi.fn(), create: vi.fn() },
      ledgerEvent: { upsert: vi.fn(async ({ create }: { create: object }) => create) },
    };
    const prisma = { $transaction: (operation: (client: typeof tx) => unknown) => operation(tx) };
    await new ImportService(prisma as never).rollback('draft');
    expect(tx.position.deleteMany).not.toHaveBeenCalled();
    expect(tx.position.create).not.toHaveBeenCalled();
    expect(tx.ledgerEvent.upsert).toHaveBeenCalledTimes(2);
    expect(tx.importDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
  });
});
