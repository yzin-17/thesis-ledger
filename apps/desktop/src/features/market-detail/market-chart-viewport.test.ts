import { describe, expect, it } from 'vitest';
import { hasLeftHistoryBlank } from './market-chart-viewport.js';

describe('hasLeftHistoryBlank', () => {
  it('仅将 Lightweight Charts 的负 barsBefore 解释为首条日线左侧的历史空白', () => {
    expect(hasLeftHistoryBlank(-0.25)).toBe(true);
    expect(hasLeftHistoryBlank(-3)).toBe(true);
    expect(hasLeftHistoryBlank(0)).toBe(false);
    expect(hasLeftHistoryBlank(4)).toBe(false);
    expect(hasLeftHistoryBlank(null)).toBe(false);
    expect(hasLeftHistoryBlank(undefined)).toBe(false);
  });
});
