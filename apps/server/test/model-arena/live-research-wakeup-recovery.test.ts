import { describe, expect, it } from 'vitest';
import { recoverInvalidResearchWakeup } from '../../src/model-arena/live/live-research-wakeup-recovery.js';

const now = new Date('2026-11-13T14:37:00Z');
const audit = (outputText: string, code = 'schema_invalid') => ({ calls: [{
  state: 'settled', error: { code }, diagnostics: { outputText },
}] });

describe('无效决策后的观察预约恢复', () => {
  it('整体订单非法但仍独立读取模型合法的未来观察时刻，只取最早时间', () => {
    const output = JSON.stringify({ action: 'decision', decision: {
      orders: [{ clientId: 'AAPL-BUY', kind: 'limit', side: 'buy', exitGroup: 'AAPL-01' }],
      wakeups: [
        { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '359' },
        { kind: 'time', at: '2026-11-15T14:35:00Z' },
        { kind: 'time', at: '2026-11-14T14:35:00Z' },
      ],
    } });
    expect(recoverInvalidResearchWakeup(audit(output), now)).toEqual({
      at: '2026-11-14T14:35:00Z', source: 'model',
    });
  });
  it('截断、无 JSON、无未来时间时使用 60 分钟保底观察', () => {
    const fallback = { at: '2026-11-13T15:37:00.000Z', source: 'fallback' };
    expect(recoverInvalidResearchWakeup(audit('{', 'output_truncated'), now)).toEqual(fallback);
    expect(recoverInvalidResearchWakeup(audit('not-json'), now)).toEqual(fallback);
    expect(recoverInvalidResearchWakeup(audit(JSON.stringify({ action: 'decision',
      decision: { wakeups: [{ kind: 'time', at: '2026-11-13T13:00:00Z' }] } })), now)).toEqual(fallback);
    expect(recoverInvalidResearchWakeup(audit(JSON.stringify({ action: 'decision',
      decision: { wakeups: [{ kind: 'fill', symbol: null }] } })), now)).toEqual(fallback);
  });
  it('无效观测字段及缺失审计不会被错误放入账本', () => {
    const invalid = JSON.stringify({ action: 'decision', decision: { wakeups: [
      { kind: 'time', at: 'malformed' }, { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: 'abc' },
    ] } });
    expect(recoverInvalidResearchWakeup(audit(invalid), now).source).toBe('fallback');
    expect(recoverInvalidResearchWakeup({}, now).source).toBe('fallback');
    expect(recoverInvalidResearchWakeup({ calls: [{ state: 'reserved', error: { code: 'schema_invalid' } }] }, now).source).toBe('fallback');
  });
});