import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MarketDerivedSeriesRepository } from '../../src/market/market-derived-series.repository.js';
import type { MarketDerivedSeriesInputV3 } from '../../src/market/market-derived-series-v3.js';

function setup() {
  const timestamp = '2025-06-01T07:00:00Z';
  const availableAt = '2026-09-27T00:00:00Z';
  const input: MarketDerivedSeriesInputV3 = {
    identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'none' },
    rawEvidenceRef: 'raw-fixture', dataAsOf: availableAt,
    bars: [{ timestamp, open: 2, high: 2, low: 2, close: 2, volume: 100, amount: 200,
      completionStatus: 'complete', availableAt }],
    conversion: { kind: 'multiplicative-price-factor', adjustment: 'qfq', evidenceRef: 'factor-proof',
      sourceRevision: 'v1', basisRef: 'fixed', anchorFactor: 2, anchorAvailableAt: availableAt,
      volumeSemantics: 'unadjusted', amountSemantics: 'unadjusted',
      factors: [{ timestamp, value: 1, availableAt }] },
  };
  type Row = { inputFingerprint: string; algorithmRevision: string; snapshot: unknown };
  const rows = new Map<string, Row>();
  const create = vi.fn(async ({ data }: { data: Row }) => {
    if (rows.has(data.inputFingerprint)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    rows.set(data.inputFingerprint, structuredClone(data));
    return data;
  });
  const findUnique = vi.fn(async ({ where }: { where: { inputFingerprint: string } }) =>
    rows.get(where.inputFingerprint) ?? null);
  const repo = new MarketDerivedSeriesRepository({ marketDerivedSeriesSnapshotV3: { create, findUnique } } as never);
  return { repo, input, rows, create, findUnique };
}

describe('派生快照仓储', () => {
  it('完整输入写入后读取重算，同内容重复写入幂等', async () => {
    const f = setup();
    const ref = await f.repo.record(f.input);
    expect(await f.repo.record(f.input)).toEqual(ref);
    expect(f.rows.size).toBe(1);
    expect((await f.repo.read(ref.inputFingerprint))?.bars[0]?.close).toBe(1);
  });
  it('相同指纹下冲突的既有记录不得覆盖', async () => {
    const f = setup();
    const ref = await f.repo.record(f.input);
    f.rows.get(ref.inputFingerprint)!.snapshot = {};
    await expect(f.repo.record(f.input)).rejects.toThrow('拒绝覆盖');
    expect(f.rows.get(ref.inputFingerprint)!.snapshot).toEqual({});
  });
  it('拒绝读取损坏载荷和算法列', async () => {
    const f = setup();
    const ref = await f.repo.record(f.input);
    f.rows.get(ref.inputFingerprint)!.algorithmRevision = 'wrong';
    await expect(f.repo.read(ref.inputFingerprint)).rejects.toThrow('不一致');
    f.rows.get(ref.inputFingerprint)!.snapshot = {};
    await expect(f.repo.read(ref.inputFingerprint)).rejects.toThrow();
  });
  it('数据库错误不能伪装为已存在或空结果', async () => {
    const f = setup();
    f.create.mockRejectedValueOnce(new Error('offline'));
    await expect(f.repo.record(f.input)).rejects.toThrow('offline');
    f.findUnique.mockRejectedValueOnce(new Error('offline'));
    await expect(f.repo.read('a'.repeat(64))).rejects.toThrow('offline');
  });
});
