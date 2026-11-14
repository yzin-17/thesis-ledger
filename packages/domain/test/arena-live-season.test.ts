import { expect, it } from 'vitest';
import { arenaLiveDateAllowed, arenaLiveSeasonEnded, arenaSeasonLabel } from '../src/arena-live-season.js';

it('不限期可以跨年持续执行，任何日期和收盘事实都不会触发自动结束', () => {
  const p = { startsOn: null, endsOn: null };
  for (const day of ['2026-11-12', '2035-12-31', '2040-01-01']) {
    expect(arenaLiveDateAllowed(p, day)).toBe(true);
    expect(arenaLiveSeasonEnded(p, day, day)).toBe(false);
  }
  expect(arenaSeasonLabel(p)).toBe('手动启动 · 手动结束');
});
it('单边日期独立约束，双边日期包含边界，完整收盘仍按原协议自动结束', () => {
  expect(arenaLiveDateAllowed({ startsOn: '2026-12-01', endsOn: null }, '2026-11-30')).toBe(false);
  expect(arenaLiveDateAllowed({ startsOn: null, endsOn: '2026-12-01' }, '2026-12-02')).toBe(false);
  const p = { startsOn: '2026-11-01', endsOn: '2026-12-01' };
  expect(arenaLiveDateAllowed(p, p.startsOn)).toBe(true);
  expect(arenaLiveDateAllowed(p, p.endsOn)).toBe(true);
  expect(arenaLiveSeasonEnded(p, p.endsOn, '2026-11-30')).toBe(false);
  expect(arenaLiveSeasonEnded(p, p.endsOn, p.endsOn)).toBe(true);
  expect(arenaLiveSeasonEnded(p, '2026-12-02')).toBe(true);
  expect(arenaSeasonLabel({ startsOn: null, endsOn: p.endsOn })).toBe('启动后至 2026-12-01');
  expect(arenaSeasonLabel({ startsOn: p.startsOn, endsOn: null })).toBe('2026-11-01 起 · 手动结束');
});
