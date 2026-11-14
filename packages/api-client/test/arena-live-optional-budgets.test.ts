import { expect, it, vi } from 'vitest';
import type { ArenaLiveProtocol } from '@thesis-ledger/schemas';
import { arenaInitialForm, arenaLiveInitialForm, saveArenaLiveSetup, type ThesisLedgerApiClient } from '../src/index.js';

const fields = ['requests', 'tokens', 'cost', 'allRequests', 'allTokens', 'allCost'] as const;
const empty = { requests: null, tokens: null, costMicros: null };
async function save(patch: Partial<ReturnType<typeof arenaLiveInitialForm>>) {
  const calendar = vi.fn(), create = vi.fn<(protocol: ArenaLiveProtocol) => Promise<{ id: string; state: 'draft' }>>().mockResolvedValue({ id: 'controlled', state: 'draft' });
  const api = { modelArenas: { calendar }, arenaMatches: { create } } as unknown as ThesisLedgerApiClient;
  await saveArenaLiveSetup(api, { ...arenaLiveInitialForm(), title: '持续比赛', ...patch }, [], ['甲', '乙'].map((model) => ({ model, providerId: 'controlled' })), {
    market: 'US', universe: 'market', budgetCurrency: 'USD', allowWebSearch: false,
  });
  expect(calendar).not.toHaveBeenCalled();
  return create.mock.calls[0]![0];
}
it('自主新建总额度默认空白，旧日频默认仍为零', async () => {
  for (const key of fields) { expect(arenaLiveInitialForm()[key]).toBe(''); expect(arenaInitialForm()[key]).toBe('0'); }
  const p = await save({});
  expect(p.budget).toEqual(empty); expect(p.entrants.every((e) => JSON.stringify(e.budget) === JSON.stringify(empty))).toBe(true);
  expect(p.entrants[0]).toMatchObject({ maxInputTokens: null, maxOutputTokens: null });
});
it('所有默认型输入可清空；有限单次、零费率和原始小数保持原义', async () => {
  const p = await save({ title: ' ', initialCash: '', maxPositionBps: ' ', buyBps: '', sellBps: '', minimum: '', slippageBps: '',
    maxActiveSymbols: '', maxResearchSteps: '', maxCycleSeconds: '', quoteIntervalSeconds: '', maxQuoteAgeSeconds: '',
    maxInput: '  ', maxOutput: '2048' });
  expect(p).toMatchObject({ title: '自主模型比赛', initialCash: '100000', maxPositionBps: 5000, decisionDeadlineMinutes: null,
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
    resources: { maxActiveSymbols: 50, maxResearchSteps: null, maxCycleSeconds: null, quoteIntervalSeconds: 30, maxQuoteAgeSeconds: 60 } });
  expect(p.entrants[0]).toMatchObject({ maxInputTokens: null, maxOutputTokens: 2048 });
  const exact = await save({ initialCash: '12345.000001', minimum: '0.000001', buyBps: '0', maxInput: '4096' });
  expect(exact.initialCash).toBe('12345.000001'); expect(exact.fees.minimum).toBe('0.000001');
  expect(exact.entrants[0]!.maxInputTokens).toBe(4096);
});
it('研究步骤与时限独立可选，有限值继续冻结，旧日频截止仍为六十分钟', async () => {
  expect(arenaLiveInitialForm().maxResearchSteps).toBe(''); expect(arenaLiveInitialForm().maxCycleSeconds).toBe('');
  const steps = await save({ maxResearchSteps: '5' });
  expect(steps.resources).toMatchObject({ maxResearchSteps: 5, maxCycleSeconds: null }); expect(steps.decisionDeadlineMinutes).toBeNull();
  const time = await save({ maxCycleSeconds: '600' });
  expect(time.resources).toMatchObject({ maxResearchSteps: null, maxCycleSeconds: 600 }); expect(time.decisionDeadlineMinutes).toBe(10);
  expect(arenaInitialForm().deadline).toBe('60');
});
it.each([{ maxInput: '0' }, { maxOutput: '-1' }, { maxOutput: '1.5' }, { maxCycleSeconds: '0' }, { initialCash: '0' }, { maxPositionBps: '0' }])('明确非法值不能转成默认或无限：%o', async (patch) => {
  await expect(save(patch)).rejects.toThrow();
});
it('分别设置模型和全场维度，保留零与高精度费用，空白为不限额', async () => {
  const p = await save({ requests: '0', tokens: '  ', cost: '0.000001', allRequests: '10', allCost: '0' });
  expect(p.entrants[0]!.budget).toEqual({ requests: 0, tokens: null, costMicros: 1 });
  expect(p.budget).toEqual({ requests: 10, tokens: null, costMicros: 0 });
});
it.each([{ requests: '-1' }, { tokens: '1.5' }, { allCost: '0.0000001' }])('非法额度在保存前拒绝：%o', async (patch) => {
  await expect(save(patch)).rejects.toThrow();
});
