import { describe, expect, it } from 'vitest';
import { percentTextToRatio, ratioToPercentText } from '../src/ratio-percent.js';

describe('比例单位合同', () => {
  it.each([-1 / 3, 2.25, Number.MAX_VALUE])('比例 %s 使用完整文本往返', (ratio) => {
    expect(percentTextToRatio(ratioToPercentText(ratio))).toBe(ratio);
  });
});
