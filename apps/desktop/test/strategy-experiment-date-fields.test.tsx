import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StrategyExperimentDateFields } from '../src/features/strategy/StrategyExperimentDateFields.js';

describe('实验时间字段的独立身份', () => {
  it('四个可见标签和输入各自关联，重复挂载仍没有重复 id', () => {
    const props = {
      values: {
        startDate: '2025-01-01',
        developmentEnd: '2025-06-30',
        validationEnd: '2025-09-30',
        endDate: '2025-12-31',
      },
      validationStart: '2025-07-01',
      testStart: '2025-10-01',
      onChange: vi.fn(),
    };
    const html = renderToStaticMarkup(
      <>
        <StrategyExperimentDateFields {...props} />
        <StrategyExperimentDateFields {...props} />
      </>,
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const label of ['开发集开始', '开发集结束', '验证集结束', '封存测试结束']) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`>${label}</label>`);
    }
  });
});
