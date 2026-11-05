import { describe, expect, it } from 'vitest';
import { chartViewportHeight } from '../../src/platform/charts/chart-layout';

describe('多窗格图表可见范围', () => {
  it('横屏开启全部指标后仍保留导航和上下文空间', () => {
    for (const height of [320, 390, 402, 411]) {
      expect(chartViewportHeight(height, 3)).toBeLessThanOrEqual(height * 0.45);
      expect(chartViewportHeight(height, 3)).toBeGreaterThanOrEqual(120);
    }
  });
  it('竖屏为指标留出空间，单窗格沿用现有高度', () => {
    expect(chartViewportHeight(874, 2)).toBeGreaterThan(chartViewportHeight(874, 0));
    expect(chartViewportHeight(874, 0)).toBe(220);
    expect(chartViewportHeight(390, 0)).toBe(137);
  });
});
