import { describe, expect, it } from 'vitest';
import { experimentSourceLabel } from '../src/features/strategy/strategy-list-presentation';
import { optimizationExperimentInstrumentLabel } from '@thesis-ledger/schemas';

const experiment = {
  name: '自定义名称保持原样',
  sourceMode: 'discovery',
  executionSymbol: '300058.SZ',
  instrumentDirectory: {
    generation: 1,
    unresolvedSymbols: [],
    items: [
      {
        symbol: '300058.SZ',
        canonicalCode: '300058',
        market: 'SZ',
        instrumentType: 'STOCK',
        displayName: '蓝色光标',
        active: true,
      },
    ],
  },
};
describe('实验标的名称消费', () => {
  it('目录名称在代码之前，来源标签保留从零探索', () => {
    expect(experimentSourceLabel(experiment as never)).toBe('蓝色光标 · 300058.SZ · 从零探索');
    expect(experiment.name).toBe('自定义名称保持原样');
  });
  it('旧响应从冻结范围取完整代码，名称缺失时只回退代码', () => {
    expect(
      optimizationExperimentInstrumentLabel({
        discoveryScope: { executionInstrument: { symbol: '300058.SZ' } },
      }),
    ).toBe('300058.SZ');
    expect(experimentSourceLabel({ ...experiment, instrumentDirectory: undefined } as never)).toBe(
      '300058.SZ · 从零探索',
    );
  });
});
