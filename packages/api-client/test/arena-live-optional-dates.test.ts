import { expect, it, vi } from 'vitest';
import { arenaLiveInitialForm, saveArenaLiveSetup, type ThesisLedgerApiClient } from '../src/index.js';

it.each([['', ''], ['2026-11-12', ''], ['', '2026-12-01'], ['2026-11-12', '2026-12-01']])('日期归一与日历预检：%s / %s', async (startsOn, endsOn) => {
  const calendar = vi.fn(async () => ({ calendarId: 'US', calendarVersion: 'controlled', timeZone: 'America/New_York' }));
  const create = vi.fn(async () => ({ id: 'controlled', state: 'draft' }));
  const api = { modelArenas: { calendar }, arenaMatches: { create } } as unknown as ThesisLedgerApiClient;
  await saveArenaLiveSetup(api, { ...arenaLiveInitialForm(), title: '持续比赛', startsOn, endsOn }, [], ['甲', '乙'].map((model) => ({ model, providerId: 'controlled' })), {
    market: 'US', universe: 'market', budgetCurrency: 'USD', allowWebSearch: false,
  });
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ startsOn: startsOn || null, endsOn: endsOn || null, calendarVersion: startsOn && endsOn ? 'controlled' : null }));
  expect(calendar).toHaveBeenCalledTimes(startsOn && endsOn ? 1 : 0);
});
