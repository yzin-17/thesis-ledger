import { expect, it, vi } from 'vitest';
import { arenaLiveInitialForm, arenaInitialForm, validateArenaLiveSetup, validateArenaSetup, saveArenaLiveSetup, saveArenaSetup,
  arenaSetupFailureFields, ArenaSetupValidationError, ThesisLedgerApiError, type ThesisLedgerApiClient } from '../src/index.js';

const options = { market: 'CN', universe: 'market', budgetCurrency: 'USD', allowWebSearch: true } as const;
const models = ['甲', '乙'].map((model) => ({ providerId: 'controlled', model }));
it('未选模型错误归位模型组，单模型和多模型均可参赛', () => {
  const result = validateArenaLiveSetup(arenaLiveInitialForm(), [], [], options);
  expect(result.success).toBe(false); expect(result.errors).toEqual({ models: '请选择参赛模型' });
  expect(validateArenaLiveSetup(arenaLiveInitialForm(), [], models.slice(0, 1), options).success).toBe(true);
  expect(validateArenaLiveSetup(arenaLiveInitialForm(), [], models, options).success).toBe(true);
});
it('日期、各级预算和研究参数分别归位，两模型的共同错误去重', () => {
  const result = validateArenaLiveSetup({ ...arenaLiveInitialForm(), startsOn: '2026-11-20', endsOn: '2026-11-13',
    cost: '0.0000001', allRequests: '-1', maxResearchSteps: '0', maxInput: '0' }, [], models, options);
  expect(Object.keys(result.errors).sort()).toEqual(['allRequests', 'cost', 'endsOn', 'maxInput', 'maxResearchSteps']);
  expect(result.errors.endsOn).toBe('赛期结束早于开始'); expect(result.errors.cost).toContain('六位小数');
});
it('固定池错误归位范围，旧日频仍要求名称和双边日期', () => {
  expect(validateArenaLiveSetup(arenaLiveInitialForm(), [], models, { ...options, universe: 'fixed' }).errors.instruments).toBe('请选择参赛标的');
  const result = validateArenaSetup(arenaInitialForm(), [], [], 'USD');
  for (const key of ['title', 'startsOn', 'endsOn', 'models', 'instruments'] as const) expect(result.errors[key]).toBeTruthy();
});
it('日频单模型通过冻结校验并原样提交，不补充其他模型', async () => {
  const create = vi.fn().mockResolvedValue({ id: 'controlled', state: 'draft' }), calendar = vi.fn().mockResolvedValue({ calendarId: 'CN', calendarVersion: 'controlled', timeZone: 'Asia/Shanghai' });
  const api = { modelArenas: { create, calendar } } as unknown as ThesisLedgerApiClient;
  const form = { ...arenaInitialForm(), title: '单模型', startsOn: '2026-11-12', endsOn: '2026-11-13' };
  await saveArenaSetup(api, form, [{ instrumentId: '11111111-1111-4111-8111-111111111111', symbol: '600036.SH', assetType: 'STOCK' }], models.slice(0, 1), 'USD');
  expect(create.mock.calls[0]![0].entrants).toHaveLength(1); expect(calendar).toHaveBeenCalledOnce();
});
it('本地失败阻止所有创建与日历请求，保留结构化错误', async () => {
  const create = vi.fn(), calendar = vi.fn();
  const api = { arenaMatches: { create }, modelArenas: { calendar } } as unknown as ThesisLedgerApiClient;
  await expect(saveArenaLiveSetup(api, arenaLiveInitialForm(), [], [], options)).rejects.toMatchObject({ fields: { models: '请选择参赛模型' } });
  expect(create).not.toHaveBeenCalled(); expect(calendar).not.toHaveBeenCalled();
});
it('结构化服务端路径映射字段，网络与服务失败保持提交级别', () => {
  const error = new ThesisLedgerApiError(400, { error: 'validation_error', message: '输入不符合要求', fields: [
    { path: 'entrants.0.maxOutputTokens', message: '输出上限配置已变化' },
    { path: 'resources.maxCycleSeconds', message: 'Too small' },
  ] });
  expect(arenaSetupFailureFields(error, true)).toEqual({ maxOutput: '输出上限配置已变化', maxCycleSeconds: '请输入 30 至 1800 的整数' });
  expect(arenaSetupFailureFields(new TypeError('Failed to fetch'), true)).toEqual({});
  expect(arenaSetupFailureFields(new ThesisLedgerApiError(500, null), true)).toEqual({});
  expect(arenaSetupFailureFields(new ArenaSetupValidationError({ models: '请选择参赛模型' }), true)).toEqual({ models: '请选择参赛模型' });
});
