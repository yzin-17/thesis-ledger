import { describe, expect, it } from 'vitest';
import { aiResearchStartInputSchema } from '../src/ai.js';

describe('研究上下文模式', () => {
  it.each(['actual', 'shadow'])('新建全组合明确保存 %s，旧 context 不被补写', (mode) => {
    expect(
      aiResearchStartInputSchema.parse({ question: '范围', context: { scope: 'portfolio', mode } })
        .context,
    ).toEqual({ scope: 'portfolio', mode });
    expect(
      aiResearchStartInputSchema.parse({ question: '历史', context: { scope: 'portfolio' } })
        .context,
    ).toEqual({ scope: 'portfolio' });
  });
  it('拒绝策略研究的账户模式和未知模式', () => {
    expect(
      aiResearchStartInputSchema.safeParse({
        question: '策略',
        context: { scope: 'strategy', strategyVersionId: 'v1', mode: 'shadow' },
      }).success,
    ).toBe(false);
    expect(
      aiResearchStartInputSchema.safeParse({
        question: '范围',
        context: { scope: 'portfolio', mode: 'all' },
      }).success,
    ).toBe(false);
  });
});
