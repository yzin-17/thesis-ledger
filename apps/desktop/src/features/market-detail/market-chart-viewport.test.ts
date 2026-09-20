import { describe, expect, it } from 'vitest';
import { hasLeftHistoryBlank, hasReachedLatestBoundary } from './market-chart-viewport.js';

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

describe('hasReachedLatestBoundary', () => {
  it('把右端贴到最后一根日线或越过它都视为已经看到最新', () => {
    expect(hasReachedLatestBoundary(0)).toBe(true);
    expect(hasReachedLatestBoundary(-1.5)).toBe(true);
    expect(hasReachedLatestBoundary(3)).toBe(false);
    expect(hasReachedLatestBoundary(null)).toBe(false);
    expect(hasReachedLatestBoundary(undefined)).toBe(false);
  });
});
