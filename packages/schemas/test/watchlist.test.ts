import { describe, expect, it } from 'vitest';
import {
  watchlistAddSchema,
  watchlistChangeSchema,
  watchlistInstrumentSchema,
  watchlistPageQuerySchema,
} from '../src/watchlist.js';

const id = '00000000-0000-4000-8000-000000000001';
describe('自选契约', () => {
  it('只接受规范目录身份，归属由服务端确定', () => {
    expect(watchlistAddSchema.parse({ instrumentId: id })).toEqual({ instrumentId: id });
    for (const input of [{ symbol: '000001' }, { instrumentId: id, ownerId: 'other' }])
      expect(watchlistAddSchema.safeParse(input).success).toBe(false);
    for (const market of ['SZ', 'SH'])
      expect(
        watchlistInstrumentSchema.parse({
          id,
          market,
          canonicalCode: '000001',
          instrumentType: 'STOCK',
          active: false,
        }).market,
      ).toBe(market);
    expect(
      watchlistInstrumentSchema.safeParse({
        id,
        market: 'SZ',
        canonicalCode: '00001',
        instrumentType: 'STOCK',
        active: true,
      }).success,
    ).toBe(false);
    expect(
      watchlistInstrumentSchema.safeParse({
        id,
        market: 'OF',
        canonicalCode: '000001',
        instrumentType: 'ETF',
        active: true,
      }).success,
    ).toBe(false);
  });
  it('移动必须携带修订，也不能用自身作锚点', () => {
    const move = { action: 'place', itemId: id, groupId: null, pinned: true, beforeId: null };
    expect(watchlistChangeSchema.safeParse(move).success).toBe(false);
    expect(watchlistChangeSchema.safeParse({ ...move, revision: 2 }).success).toBe(true);
    expect(watchlistChangeSchema.safeParse({ ...move, revision: 2, beforeId: id }).success).toBe(
      false,
    );
  });
  it('限制可见页读取范围', () => {
    expect(watchlistPageQuerySchema.parse({})).toEqual({ offset: 0, limit: 50 });
    expect(watchlistPageQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});

it('保留带当前修订的冲突响应，拒绝错误码或负修订', async () => {
  const { watchlistConflictSchema } = await import('../src/watchlist.js');
  expect(
    watchlistConflictSchema.parse({
      code: 'WATCHLIST_REVISION_CONFLICT',
      currentRevision: 4,
      message: '请重读',
    }),
  ).toEqual({ code: 'WATCHLIST_REVISION_CONFLICT', currentRevision: 4 });
  expect(watchlistConflictSchema.safeParse({ code: 'other', currentRevision: 4 }).success).toBe(
    false,
  );
  expect(
    watchlistConflictSchema.safeParse({ code: 'WATCHLIST_REVISION_CONFLICT', currentRevision: -1 })
      .success,
  ).toBe(false);
});
