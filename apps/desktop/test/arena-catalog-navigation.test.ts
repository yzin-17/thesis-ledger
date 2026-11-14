import { describe, expect, it } from 'vitest';
import { arenaCatalogReturn, readArenaCatalogParams, updateArenaCatalogParams } from '../src/features/model-arena/arena-catalog-navigation.js';

describe('比赛列表 URL 状态', () => {
  it('无效字段独立回落，不丢弃其他合法筛选', () => {
    expect(readArenaCatalogParams(new URLSearchParams('state=invalid&market=HK&page=-1&pageSize=10&search=Gemma')))
      .toMatchObject({ state: 'all', market: 'HK', page: 1, pageSize: 10, search: 'Gemma' });
  });
  it('筛选与每页数量改变时回到首页，分页操作保留筛选和其他 URL 参数', () => {
    const source = new URLSearchParams('market=US&page=3&pageSize=10&from=journal');
    const filtered = updateArenaCatalogParams(source, { state: 'paused' });
    expect(filtered.get('page')).toBeNull();
    expect(filtered.get('from')).toBe('journal');
    const page = updateArenaCatalogParams(filtered, { page: 2 });
    expect(page.get('page')).toBe('2'); expect(page.get('state')).toBe('paused');
    expect(updateArenaCatalogParams(page, { pageSize: 50 }).get('page')).toBeNull();
    expect(source.get('page')).toBe('3');
  });
  it('只接受竞技场列表的安全返回地址', () => {
    expect(arenaCatalogReturn({ arenaReturn: '/arena?market=CN&page=2' })).toBe('/arena?market=CN&page=2');
    for (const path of ['https://other.example', '//other.example', '/arena/other', '/arena?x=\n', '/arena?x=\\other', '/arena?x=#model'])
      expect(arenaCatalogReturn({ arenaReturn: path })).toBe('/arena');
    expect(arenaCatalogReturn(null)).toBe('/arena');
  });
  it('Desktop 固定按创建时间倒序，旧 URL 排序在更新时移除', () => {
    const params = new URLSearchParams('sort=created_asc&market=CN&page=2');
    expect(readArenaCatalogParams(params).sort).toBe('created_desc');
    const next = updateArenaCatalogParams(params, { page: 3, sort: 'title' });
    expect(next.has('sort')).toBe(false);
    expect(next.get('page')).toBe('3');
    expect(next.get('market')).toBe('CN');
  });
});
