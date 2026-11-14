import { describe, expect, it } from 'vitest';
import { arenaDailyLegacyTarget, readArenaDailyNavigation, updateArenaDailyNavigation } from '../src/features/model-arena/arena-daily-navigation';
const round = '66666666-6666-4666-8666-666666666666', model = '88888888-8888-4888-8888-888888888888';
describe('比赛内记录导航', () => {
  it('旧轮次及模型锚点统一为比赛内记录，保留其他上下文', () => {
    const target = arenaDailyLegacyTarget('/arena/history/match', '?mode=shadow', round, '#model-' + model);
    expect(target.pathname).toBe('/arena/history/match'); expect(target.hash).toBe('');
    expect(readArenaDailyNavigation(new URLSearchParams(target.search))).toEqual({ view: 'activity', roundId: round, modelId: model, invalidRound: false, invalidModel: false });
    expect(new URLSearchParams(target.search).get('mode')).toBe('shadow');
  });
  it('切换页签保留日期与模型，清除模型只改变模型范围', () => {
    const initial = new URLSearchParams({ view: 'activity', round, model });
    const accounts = updateArenaDailyNavigation(initial, { view: 'accounts' });
    expect(accounts.get('round')).toBe(round); expect(accounts.get('model')).toBe(model);
    expect(updateArenaDailyNavigation(accounts, { modelId: null }).has('model')).toBe(false);
    expect(updateArenaDailyNavigation(accounts, { view: 'performance' }).has('view')).toBe(false);
    expect(initial.get('view')).toBe('activity');
  });
  it('无效标识与未指定标识区分，避免错误链接显示其他轮次', () => {
    expect(readArenaDailyNavigation(new URLSearchParams()).invalidRound).toBe(false);
    const invalid = readArenaDailyNavigation(new URLSearchParams({ round: '../other', model: 'unknown', view: 'unknown' }));
    expect(invalid).toEqual({ view: 'performance', roundId: null, modelId: null, invalidRound: true, invalidModel: true });
  });
  it('合法的大写标识与服务端小写记录保持同一身份', () => {
    const id = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    const result = readArenaDailyNavigation(new URLSearchParams({ view: 'activity', round: id, model: id }));
    expect(result.roundId).toBe(id.toLowerCase()); expect(result.modelId).toBe(id.toLowerCase());
  });
});
