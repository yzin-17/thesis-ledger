import { describe, expect, it } from 'vitest';
import { arenaCatalogQuerySchema } from '../src/arena-catalog.js';

describe('比赛目录筛选合同', () => {
  it('默认条件和 URL 数字明确，合法筛选保持不变', () => {
    expect(arenaCatalogQuerySchema.parse({})).toEqual({ search: '', kind: 'all', market: 'all', state: 'all',
      sort: 'created_desc', page: 1, pageSize: 25 });
    expect(arenaCatalogQuerySchema.parse({ search: '  Atlas  ', kind: 'history', market: 'US', state: 'ended',
      sort: 'title', page: '2', pageSize: '10' })).toMatchObject({ search: 'Atlas', page: 2, pageSize: 10 });
  });
  it.each([{ page: '0' }, { page: '1.1' }, { pageSize: '1000' }, { kind: 'unknown' }, { sort: 'title;drop' },
    { state: 'unknown' }, { search: 'x'.repeat(201) }, { ownerId: 'another-owner' }])('拒绝无界或越权筛选 %j', (input) => {
    expect(arenaCatalogQuerySchema.safeParse(input).success).toBe(false);
  });
});
