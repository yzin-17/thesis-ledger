import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExperimentDefinitionDiffEntries } from '../src/features/strategy/StrategyExperimentCandidateDiff.js';

describe('候选的具体策略差异展示', () => {
  it('展示中文字段、具体入场与风控规则及完整定义，不隐藏对象和数组', () => {
    const entries = [
      { kind: 'full-strategy', path: '$.name', before: '原策略', after: 'MA20趋势策略' },
      {
        kind: 'full-strategy',
        path: '$.entry',
        before: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
        after: {
          type: 'all',
          conditions: [
            { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
            {
              type: 'cross',
              direction: 'above',
              left: { type: 'series', sourceId: 'primary', field: 'close' },
              right: {
                type: 'indicator',
                name: 'MA',
                input: { type: 'series', sourceId: 'primary', field: 'close' },
                params: { period: 20 },
              },
            },
          ],
        },
      },
      {
        kind: 'full-strategy',
        path: '$.risk',
        before: [],
        after: [
          { type: 'fixedStop', percent: '0.05' },
          { type: 'fixedTakeProfit', percent: '0.1' },
          { type: 'maxHoldingPeriod', periods: 10 },
        ],
      },
    ];
    const before = structuredClone(entries);
    const html = renderToStaticMarkup(<ExperimentDefinitionDiffEntries entries={entries} />);
    for (const text of [
      '策略名称',
      '原策略',
      'MA20趋势策略',
      '入场条件',
      '上穿',
      '20',
      '风险规则',
      '固定止损',
      '5%',
      '固定止盈',
      '10%',
      '最多持有 10 个周期',
      '查看完整定义',
      'sourceId',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('完整基线定义');
    expect(entries).toEqual(before);
  });
  it('新增、空值、布尔值与不可用定义分别保留', () => {
    const html = renderToStaticMarkup(
      <ExperimentDefinitionDiffEntries
        entries={[
          { path: '$.description', before: undefined, after: null },
          { label: '测试开关', before: false, after: true },
          {
            kind: 'full-strategy',
            status: 'unavailable',
            reason: '冻结的候选策略定义缺失或无效，无法比较。',
          },
        ]}
      />,
    );
    for (const text of ['未设置', '空值', 'false', 'true', '候选策略定义缺失'])
      expect(html).toContain(text);
  });
});
