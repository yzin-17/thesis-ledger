import { describe, expect, it } from 'vitest';
import { journalReviewPrompt, journalPeriodReviewPrompt } from '../../src/journal/journal-review-prompt.js';

describe('复盘解读的业务证据边界', () => {
  it.each([journalReviewPrompt, journalPeriodReviewPrompt])('版本 $version 禁止将价格比较写成市场路径或目标已完成', (prompt) => {
    expect(prompt.template).toContain('不能证明期间是否触及或触发止损');
    expect(prompt.template).toContain('部分成交达到目标价不代表整体退出达标');
    expect(prompt.template).toContain('反事实是条件测算，不是实际成交');
    expect(prompt.template).toContain('可能原因必须标为假设及证据缺口');
    expect(prompt.template).toContain('不得改写交易生命周期、统计资格');
  });
  it('周期提示保留独立统计粒度而不是相加', () => {
    expect(journalPeriodReviewPrompt.template).toContain('不得将不同粒度的数量或损益相加');
    expect(journalPeriodReviewPrompt.template).toContain('冻结窗口、统计资格和排除原因');
  });
});
