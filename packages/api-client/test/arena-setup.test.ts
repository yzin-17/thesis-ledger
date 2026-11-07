import { expect, it, vi } from 'vitest';
import {
  arenaInitialForm,
  arenaMerge,
  arenaModels,
  copyArenaGroup,
  saveArenaSetup,
  type ThesisLedgerApiClient,
} from '../src/index.js';
const group = '00000000-0000-4000-8000-000000000001',
  instrumentId = '00000000-0000-4000-8000-000000000002';
const instrument = { instrumentId, symbol: '600001.SH', assetType: 'STOCK' as const };
it('无持仓从目录保存比赛，只读取一次日历并保存草稿；费用明确为预算币种百万分之一', async () => {
  const calendar = vi.fn(async () => ({
      calendarId: 'CN',
      calendarVersion: 'test',
      timeZone: 'Asia/Shanghai',
    })),
    create = vi.fn(async () => ({ id: group, state: 'draft' })),
    transition = vi.fn();
  const api = { modelArenas: { calendar, create, transition } } as unknown as ThesisLedgerApiClient;
  await saveArenaSetup(
    api,
    {
      ...arenaInitialForm(),
      title: '双模型',
      startsOn: '2026-11-06',
      endsOn: '2026-11-30',
      cost: '0.010256',
      allCost: '0.02',
    },
    [instrument],
    ['甲', '乙'].map((model) => ({ model, providerId: 'fixture' })),
    'USD',
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      budget: { requests: 0, tokens: 0, costMicros: 20000 },
      entrants: expect.arrayContaining([
        expect.objectContaining({
          model: '甲',
          budget: { requests: 0, tokens: 0, costMicros: 10256 },
        }),
      ]),
    }),
  );
  expect(calendar).toHaveBeenCalledTimes(1);
  expect(transition).not.toHaveBeenCalled();
});
it('复制分组只保留标的身份，跨市场拒绝，翻页换修订整组不导入', async () => {
  const row = {
    instrument: {
      id: instrumentId,
      canonicalCode: '600001',
      market: 'SH',
      instrumentType: 'STOCK',
      active: true,
    },
  };
  const page = { groups: [{ id: group }], revision: 2, items: [row], nextOffset: null };
  const list = vi.fn().mockResolvedValue(page);
  const api = { watchlist: { list } } as unknown as ThesisLedgerApiClient;
  expect(await copyArenaGroup(api, group)).toEqual([instrument]);
  expect(() =>
    arenaMerge([instrument], [{ ...instrument, instrumentId: group, symbol: 'MSFT.US' }]),
  ).toThrow('同一市场');
  list
    .mockResolvedValueOnce({ ...page, nextOffset: 1 })
    .mockResolvedValueOnce({ ...page, revision: 3 });
  await expect(copyArenaGroup(api, group)).rejects.toThrow('名单已变化');
});

it('已验证且只待比赛预算的模型可选，停用、故障、未验证和缺价格均不可选', () => {
  const route = {
    model: '付费模型',
    adapter: 'openai-compatible' as const,
    mode: 'json_validated' as const,
    adapterEvidence: {
      adapter: 'openai-compatible' as const,
      adapterVersion: 'test',
      sdkVersion: 'test',
      contract: { id: 'arena_decision', version: 'arena-decision-v1' } as const,
      mode: 'json_validated' as const,
      releaseFingerprint: 'test',
    },
    contract: { id: 'arena_decision', version: 'arena-decision-v1' } as const,
    liveValidation: {
      status: 'passed' as const,
      checkedAt: '2026-11-06T00:00:00Z',
      requestId: group,
    },
    readiness: {
      state: 'blocked' as const,
      reasons: ['budget_not_authorized' as const],
      configurationFingerprint: 'test',
      evaluatedAt: '2026-11-06T00:00:00Z',
    },
  };
  const provider = {
    name: '接入',
    type: 'ai' as const,
    enabled: true,
    priority: 1,
    capabilities: ['chat'],
    health: 'healthy',
    executionRoutes: [route],
    modelPricing: {
      付费模型: { costPer1kInput: 0.001, costPer1kOutput: 0.002, costCurrency: 'USD' },
    },
  };
  expect(arenaModels([provider])).toEqual([{ providerId: '接入', model: '付费模型' }]);
  expect(
    arenaModels([
      { ...provider, enabled: false },
      { ...provider, modelPricing: {} },
      {
        ...provider,
        executionRoutes: [
          {
            ...route,
            readiness: { ...route.readiness, reasons: ['budget_not_authorized', 'provider_down'] },
          },
        ],
      },
      {
        ...provider,
        executionRoutes: [
          { ...route, liveValidation: { status: 'not_run', requestId: null, checkedAt: null } },
        ],
      },
    ]),
  ).toEqual([]);
});
